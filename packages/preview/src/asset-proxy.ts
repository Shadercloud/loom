/**
 * `rbxassetid://` resolution for the preview: a dev-server route, and a
 * build-time bake for the static output that has no server to ask.
 *
 * A browser cannot resolve an asset id by itself: Roblox's thumbnail API sends
 * no `Access-Control-Allow-Origin`, so the JSON read is blocked cross-origin.
 * The *image* it points at needs no CORS at all — a browser loads any origin —
 * so only the id → URL hop has to happen server-side.
 *
 * - **Dev** ({@link loomAssetProxy}): the server does that hop and answers with
 *   a redirect, which keeps the browser half synchronous — the client resolver
 *   just points the layer at this route.
 * - **Build** ({@link loomAssetBundle}): there is no server later, so the ids
 *   the build can account for — read out of the emitted output, plus whatever
 *   prerendering the targets turned up (`./prerender.ts`) — are resolved *now*,
 *   the images are downloaded into the output, and a manifest maps each id to
 *   its emitted file. The page then needs nothing but its own origin.
 */
import type { Plugin, ViteDevServer } from "vite";

/** Route the client resolver points at, appended to the configured base. */
export const ASSET_ROUTE = "__loom/asset/";

/**
 * Where the baked manifest lands in a build, appended to the configured base.
 * `./globals.ts` spells this out again rather than importing it: that module is
 * bundled into the page, and this one is server code.
 */
export const ASSET_MANIFEST = "__loom/assets.json";

/** How long a resolved CDN URL stays good enough to hand out again. */
const CACHE_TTL_MS = 10 * 60 * 1000;

interface CacheEntry {
	url: string;
	expires: number;
}

const cache = new Map<string, CacheEntry>();

/** Exposed for tests; the dev server never needs to clear this itself. */
export function clearAssetCache(): void {
	cache.clear();
}

/**
 * `assetId` → CDN image URL via Roblox's thumbnail API. Throws with a readable
 * message on anything the caller should see as a 502.
 */
export async function resolveAssetUrl(
	assetId: string,
	size = "420x420",
	fetchImpl: typeof fetch = fetch,
): Promise<string> {
	const key = `${assetId}@${size}`;
	const hit = cache.get(key);
	if (hit && hit.expires > Date.now()) return hit.url;

	const endpoint = new URL("https://thumbnails.roblox.com/v1/assets");
	endpoint.searchParams.set("assetIds", assetId);
	endpoint.searchParams.set("size", size);
	endpoint.searchParams.set("format", "Png");
	endpoint.searchParams.set("isCircular", "false");

	const response = await fetchImpl(endpoint);
	if (!response.ok) {
		throw new Error(
			`thumbnail lookup failed (${response.status} ${response.statusText})`,
		);
	}
	const body = (await response.json()) as {
		data?: Array<{ state?: string; imageUrl?: string }>;
	};
	const thumbnail = body.data?.[0];
	if (!thumbnail?.imageUrl || thumbnail.state !== "Completed") {
		throw new Error(
			`no thumbnail for asset ${assetId} (state: ${thumbnail?.state ?? "missing"})`,
		);
	}
	cache.set(key, {
		url: thumbnail.imageUrl,
		expires: Date.now() + CACHE_TTL_MS,
	});
	return thumbnail.imageUrl;
}

/** `/__loom/asset/12345` → `"12345"`; undefined when the path is not ours. */
export function assetIdFromPath(
	path: string,
	base: string,
): string | undefined {
	const route = `${base}${ASSET_ROUTE}`;
	if (!path.startsWith(route)) return undefined;
	const id = path.slice(route.length);
	return /^\d+$/.test(id) ? id : undefined;
}

/**
 * Serve `<base>__loom/asset/<id>` as a 302 to the asset's CDN image, so an
 * `<img>` pointed at this route paints the Roblox asset.
 */
export function loomAssetProxy(): Plugin {
	let base = "/";
	return {
		name: "loom:asset-proxy",
		configResolved(config) {
			base = config.base;
		},
		configureServer(server: ViteDevServer) {
			server.middlewares.use((req, res, next) => {
				const path = (req.url ?? "/").split("?")[0] ?? "/";
				const assetId = assetIdFromPath(path, base);
				if (assetId === undefined) return next();
				resolveAssetUrl(assetId)
					.then((url) => {
						res.statusCode = 302;
						res.setHeader("Location", url);
						// The CDN URL is signed and expires; let the browser reuse this
						// redirect for a while but never bake it into a build cache.
						res.setHeader("Cache-Control", "private, max-age=300");
						res.end();
					})
					.catch((err: unknown) => {
						const message = err instanceof Error ? err.message : String(err);
						console.warn(`[loom] asset ${assetId}: ${message}`);
						res.statusCode = 502;
						res.setHeader("Content-Type", "text/plain");
						res.end(`could not resolve asset ${assetId}: ${message}`);
					});
			});
		},
	};
}

// --- static build ------------------------------------------------------------

/** Every `rbxassetid://<id>` a piece of emitted output mentions. */
export function assetIdsIn(
	code: string,
	into = new Set<string>(),
): Set<string> {
	for (const match of code.matchAll(/rbxassetid:\/\/(\d+)/g)) {
		const id = match[1];
		if (id !== undefined) into.add(id);
	}
	return into;
}

/**
 * Whether the output builds an asset id at runtime — `rbxassetid://` with
 * something other than digits after it, which is what
 * `` `rbxassetid://${iconId}` `` minifies to.
 *
 * The ids behind one of these are unreadable here (after bundling they are bare
 * numbers among every other number), so the scan alone would silently bake
 * nothing. It is the reason for the prerender, and the thing to name in the
 * warning when the prerender still came back empty.
 */
export function composesAssetIds(code: string): boolean {
	return /rbxassetid:\/\/(?!\d)/.test(code);
}

/** File extension for a downloaded thumbnail, from what the CDN said it is. */
function extensionFor(contentType: string | null): string {
	if (contentType?.includes("jpeg")) return "jpg";
	if (contentType?.includes("webp")) return "webp";
	if (contentType?.includes("gif")) return "gif";
	// The thumbnail endpoint is asked for `format=Png`, so this is the answer
	// almost every time.
	return "png";
}

/** id → the bytes and the name they were served under. */
async function downloadAsset(
	assetId: string,
	fetchImpl: typeof fetch,
): Promise<{ fileName: string; source: Uint8Array }> {
	const url = await resolveAssetUrl(assetId, "420x420", fetchImpl);
	const response = await fetchImpl(url);
	if (!response.ok) {
		throw new Error(
			`download failed (${response.status} ${response.statusText})`,
		);
	}
	return {
		fileName: `${ASSET_ROUTE}${assetId}.${extensionFor(response.headers.get("content-type"))}`,
		source: new Uint8Array(await response.arrayBuffer()),
	};
}

export interface AssetBundleOptions {
	/** Injectable for tests; the build itself has no reason to pass one. */
	fetchImpl?: typeof fetch;
	/**
	 * Extra `Image` values from somewhere the emitted code cannot be read for
	 * them — `./prerender.ts` mounts the targets and reports what their trees
	 * hold, which is how a runtime-composed id gets baked. Absent, the build
	 * falls back to the literal scan alone.
	 */
	discover?: (
		root: string,
		warn: (message: string) => void,
	) => Promise<Iterable<string>>;
}

/**
 * Resolve and download every asset id the build can account for, then emit them
 * — plus a `<base>__loom/assets.json` manifest — into the build output, so a
 * static preview paints its `rbxassetid://` images with no server behind it.
 *
 * Two sources, because one is not enough. The **scan** reads the emitted output
 * for `rbxassetid://<digits>`, which finds every id a source spells out. The
 * **prerender** ({@link AssetBundleOptions.discover}) mounts the gallery
 * targets and reads their live trees, which is the only way to see an id built
 * at runtime — `` `rbxassetid://${iconId}` `` leaves nothing in the bundle to
 * match. What neither covers is an id the first render never reaches (behind a
 * hover state, or fetched later); that one stays unresolved, and the build says
 * so rather than leaving a blank image unexplained.
 *
 * Never fails the build, and that holds for the whole pass, not just the
 * downloads: an id that will not resolve (offline, deleted, or moderated) is
 * warned about and left out of the manifest, and a prerender that cannot even
 * start is warned about and skipped. Either way the output is what it would
 * have been before this plugin ran.
 */
export function loomAssetBundle(options: AssetBundleOptions = {}): Plugin {
	const fetchImpl = options.fetchImpl ?? fetch;
	let root = process.cwd();
	return {
		name: "loom:asset-bundle",
		apply: "build",
		configResolved(config) {
			root = config.root;
		},
		async generateBundle(_options, bundle) {
			const ids = new Set<string>();
			let composed = false;
			for (const file of Object.values(bundle)) {
				const code = file.type === "chunk" ? file.code : file.source;
				if (typeof code !== "string") continue;
				assetIdsIn(code, ids);
				composed ||= composesAssetIds(code);
			}
			const scanned = ids.size;
			let prerenderFailed = false;
			// Only for composition. With every id spelled out the scan already has
			// them all, and mounting the whole gallery to rediscover them would be
			// seconds spent to learn nothing.
			if (options.discover && composed) {
				try {
					for (const image of await options.discover(root, (message) => {
						this.warn(`[loom] ${message}`);
					})) {
						assetIdsIn(image, ids);
					}
				} catch (err: unknown) {
					// A *scene* that will not render is already warned about and skipped
					// inside the prerender. Reaching here means the pass itself never
					// got as far as a scene — a Vite server that would not start, a
					// module that would not load — and that is no reason to lose a build
					// over images. Fall back to the ids the scan read.
					prerenderFailed = true;
					const message = err instanceof Error ? err.message : String(err);
					this.warn(
						`[loom] could not prerender the gallery targets, so any \`rbxassetid://\` ` +
							`id this build composes at runtime stays unresolved in the static ` +
							`output: ${message}`,
					);
				}
			}
			if (composed && !prerenderFailed && ids.size === scanned) {
				this.warn(
					"[loom] this build composes `rbxassetid://` ids at runtime, and " +
						"prerendering the targets surfaced none of them — those images " +
						"will not paint in the static output. They resolve under `loom " +
						"preview`, which has a server to ask.",
				);
			}
			if (ids.size === 0) return;

			const manifest: Record<string, string> = {};
			await Promise.all(
				[...ids].map(async (assetId) => {
					try {
						const { fileName, source } = await downloadAsset(
							assetId,
							fetchImpl,
						);
						this.emitFile({ type: "asset", fileName, source });
						manifest[assetId] = fileName;
					} catch (err: unknown) {
						const message = err instanceof Error ? err.message : String(err);
						this.warn(`[loom] asset ${assetId}: ${message}`);
					}
				}),
			);
			this.emitFile({
				type: "asset",
				fileName: ASSET_MANIFEST,
				source: JSON.stringify(manifest),
			});
		},
	};
}
