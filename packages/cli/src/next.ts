/**
 * `loom-dev/next` — mount the loom gallery inside a Next.js app.
 *
 * Next.js has no hook for mounting foreign dev middleware (`loom-dev/embed`'s
 * Connect middleware fits Astro/Express hosts, not `next dev`), and dropping
 * the loom Vite plugin into Next's own bundler is off the table for the same
 * reason `embed.ts` isolates it: the plugin rewrites `react` and `@rbxts/*`
 * for the whole config it lives in, which would hijack the host app's React.
 *
 * So the integration keeps the gallery in its own Vite instance and lets Next
 * forward HTTP, exactly like the Astro embed — just over a port instead of a
 * middleware chain:
 *
 * - **dev** — {@link withLoomGallery}'s `rewrites()` lazily boots a standalone
 *   gallery server ({@link startGalleryServer}) on an ephemeral port and
 *   proxies `base/*` to it via `beforeFiles` rewrites (ahead of `public/`, so
 *   a committed static gallery never shadows the live one). HMR rides Vite's
 *   own WebSocket port and bypasses Next entirely.
 * - **build** — the wrapper is a Next *function config* (`(phase, ctx) =>
 *   config`), so `next build` announces itself as `phase-production-build` and
 *   the wrapper emits the static gallery into `public/<base>` right there —
 *   the same automatic build hook the Astro embed gets, no `prebuild` script.
 *   (An env-var marker keeps Next's config-reloading worker processes from
 *   rebuilding it; `staticBuild: false` opts out for a CI that runs `loom
 *   build` itself.)
 * - **start** — no server, nothing built. The injected `afterFiles` rewrite
 *   maps the bare mount path onto the built gallery's `index.html`, which
 *   Next's public-file serving does not do for directories.
 *
 * The rewrite source/destination shapes dodge a redirect loop: Next strips a
 * trailing slash (`308 /loom-preview/ → /loom-preview`) while the gallery
 * middleware adds one (`301 /loom-preview → /loom-preview/`), so the bare
 * mount path is rewritten straight to the slashed upstream URL and the 301
 * never fires.
 */
import { createServer as createHttpServer } from "node:http";
import { join, resolve } from "node:path";
// Type-only: the value import happens lazily inside the dev path so evaluating
// a next.config that uses `withLoomGallery` (every `next build` / `next start`)
// doesn't pay for loading Vite.
import type { GalleryEmbedOptions } from "./embed.ts";

/** Where the gallery is mounted when the host doesn't say (mirrors embed.ts). */
const DEFAULT_BASE = "/loom-preview/";

/** Normalize a mount path to the `/…/` shape (same rule as `loom-dev/embed`). */
function normalizeBase(base?: string): string {
	if (!base || base === "/" || base === "") return DEFAULT_BASE;
	const withLeading = base.startsWith("/") ? base : `/${base}`;
	return withLeading.endsWith("/") ? withLeading : `${withLeading}/`;
}

// Minimal structural types for the slice of a Next config this module touches.
// Deliberately not imported from `next`: the wrapper must not force a `next`
// dependency (or version) on this package, and the generic signature of
// {@link withLoomGallery} hands the caller's own config type straight back.

// No index signature: Next's own `Rewrite` (with its `has`/`missing`/`locale`
// extras) must stay structurally assignable to this, and an interface carries
// no implicit index signature to satisfy one. Extra fields on user rules pass
// through untouched at runtime.
export interface NextRewrite {
	source: string;
	destination: string;
}

export interface NextRewriteGroups {
	beforeFiles?: NextRewrite[];
	afterFiles?: NextRewrite[];
	fallback?: NextRewrite[];
}

/** What a Next `rewrites()` may resolve to: a flat list or phased groups. */
export type NextRewritesResult = NextRewrite[] | NextRewriteGroups;

export interface NextConfigLike {
	rewrites?: () => NextRewritesResult | Promise<NextRewritesResult>;
}

export interface LoomNextOptions {
	/**
	 * Project dir whose `*.loom.tsx` targets are served, resolved against the
	 * Next app's cwd (`next dev`/`next build` run from the app dir).
	 */
	root: string;
	/**
	 * Target discovery: a glob, a directory, a list of either, or `true` for the
	 * default `**\/*.loom.tsx`. Same semantics as the CLI's `--targets`.
	 */
	targets?: string | string[] | true;
	/** Public path the gallery is served under. Defaults to `/loom-preview/`. */
	base?: string;
	/** Pin the dev gallery's port. Left unset, an ephemeral free port is used. */
	port?: number;
	/** Vite's HMR WebSocket port — see `GalleryEmbedOptions.hmrPort`. */
	hmrPort?: number | false;
	/**
	 * Set `false` to skip the automatic static gallery build during
	 * `next build` and manage `public/<base>` yourself (`loom build <root>
	 * --targets <glob> --out public/loom-preview --base /loom-preview/`).
	 */
	staticBuild?: boolean;
	/**
	 * Package redirects for roblox-ts packages loom can't run — see
	 * `GalleryEmbedOptions.shims`. Paths are relative to {@link root}, not to the
	 * Next app, so `next dev` and the `next build` static gallery agree.
	 */
	shims?: Record<string, string>;
}

/**
 * Resolve the Loom project root once, relative to the Next app directory.
 *
 * Next evaluates `next.config.*` with the app as its cwd. Capturing the
 * absolute path while the wrapper is created keeps later config workers or
 * deferred `rewrites()` calls from changing what a relative `root` means.
 * `appDir` is injectable so the contract can be tested without a Next process.
 */
export function resolveLoomNextOptions(
	options: LoomNextOptions,
	appDir = process.cwd(),
): LoomNextOptions {
	return { ...options, root: resolve(appDir, options.root) };
}

export interface StandaloneGalleryServer {
	/** The port the gallery answers on (the requested one, or the free pick). */
	port: number;
	/** `http://127.0.0.1:<port>` — the proxy destination prefix. */
	origin: string;
	/** The normalized base (always `/…/`) the gallery is served under. */
	base: string;
	/** Shut the HTTP wrapper and the underlying gallery Vite server down. */
	close(): Promise<void>;
}

/**
 * Run the embed's gallery middleware behind a real HTTP server, for hosts that
 * can only forward requests to a URL (Next rewrites) rather than mount a
 * middleware. Loopback-only: this is a dev upstream, not something to expose.
 */
export async function startGalleryServer(
	options: GalleryEmbedOptions & { port?: number },
): Promise<StandaloneGalleryServer> {
	const { createGalleryServer } = await import("./embed.ts");
	const gallery = await createGalleryServer(options);
	const server = createHttpServer((req, res) => {
		gallery.middleware(req, res, (err) => {
			res.statusCode = err ? 500 : 404;
			res.end(err ? "loom gallery: internal error" : "not found");
		});
	});
	await new Promise<void>((listening, reject) => {
		server.once("error", reject);
		server.listen(options.port ?? 0, "127.0.0.1", listening);
	});
	const address = server.address();
	const port =
		typeof address === "object" && address !== null ? address.port : 0;
	return {
		port,
		origin: `http://127.0.0.1:${port}`,
		base: gallery.base,
		async close() {
			await new Promise<void>((closed) => {
				server.close(() => closed());
			});
			await gallery.close();
		},
	};
}

/**
 * The dev-mode proxy rules for a gallery at `origin` mounted under `base`.
 * The bare-path rule comes first and targets the slashed upstream URL
 * directly — routing it through the catch-all would trigger the middleware's
 * `301 → /base/`, which Next's trailing-slash normalization bounces right
 * back (see the module doc).
 */
export function loomDevRewrites(base: string, origin: string): NextRewrite[] {
	const bare = base.slice(0, -1);
	return [
		{ source: bare, destination: `${origin}${base}` },
		{ source: `${bare}/:path*`, destination: `${origin}${bare}/:path*` },
	];
}

/**
 * The production rule: Next serves `public/` files only at their exact paths,
 * so the bare mount of a statically built gallery needs an explicit map onto
 * its `index.html`. Harmless when nothing was built there (the destination
 * 404s the same way the source would have).
 */
export function loomStaticRewrites(base: string): NextRewrite[] {
	return [{ source: base.slice(0, -1), destination: `${base}index.html` }];
}

/**
 * Merge loom's rewrites into whatever the user's `rewrites()` produced. A flat
 * user array means "afterFiles" (Next's own equivalence), so it stays one —
 * appended after loom's `afterFiles` additions, with loom's `beforeFiles`
 * layered in front.
 */
export function mergeRewrites(
	user: NextRewritesResult | undefined,
	loom: { beforeFiles?: NextRewrite[]; afterFiles?: NextRewrite[] },
): NextRewriteGroups {
	const groups: NextRewriteGroups =
		user === undefined ? {} : Array.isArray(user) ? { afterFiles: user } : user;
	return {
		beforeFiles: [...(loom.beforeFiles ?? []), ...(groups.beforeFiles ?? [])],
		afterFiles: [...(loom.afterFiles ?? []), ...(groups.afterFiles ?? [])],
		fallback: groups.fallback ?? [],
	};
}

/** The moving parts `withLoomGallery` wires in — injectable for tests. */
export interface LoomRewritesEnv {
	/** Whether this process is a dev server (`next dev`). */
	dev: boolean;
	/** Boot (or return the already-booted) gallery server. */
	ensureServer(): Promise<Pick<StandaloneGalleryServer, "origin">>;
}

/**
 * Build the composed `rewrites()` for {@link withLoomGallery}. Split out (with
 * an injectable env) so the dev/prod branching and the merge are unit-testable
 * without booting a Vite server.
 */
export function createLoomRewrites(
	userRewrites: NextConfigLike["rewrites"],
	base: string,
	env: LoomRewritesEnv,
): () => Promise<NextRewriteGroups> {
	return async () => {
		const user = await userRewrites?.();
		if (!env.dev) {
			return mergeRewrites(user, { afterFiles: loomStaticRewrites(base) });
		}
		try {
			const { origin } = await env.ensureServer();
			return mergeRewrites(user, {
				beforeFiles: loomDevRewrites(base, origin),
			});
		} catch (err) {
			// A gallery that fails to boot must not take `next dev` down with it:
			// keep the user's rewrites, skip the proxy rules, say why.
			console.error("loom: gallery dev server failed to start —", err);
			return mergeRewrites(user, {});
		}
	};
}

// Next's phase names, verbatim (`next/constants`). Hardcoded rather than
// imported: this package has no `next` dependency to import them from, and
// they are a stable public contract.
export const PHASE_DEVELOPMENT_SERVER = "phase-development-server";
export const PHASE_PRODUCTION_BUILD = "phase-production-build";

/** A Next config in its function form — what {@link withLoomGallery} returns. */
export type NextConfigPhaseFn<C> = (
	phase: string,
	context: unknown,
) => Promise<C>;

/** `public/<base>` as a relative path (`/loom-preview/` → `public/loom-preview`). */
export function staticGalleryOutDir(base: string): string {
	return join("public", ...base.split("/").filter(Boolean));
}

/**
 * Cross-process once-guard for {@link buildStaticGalleryOnce}. An env var, not
 * a module flag: `next build` re-evaluates the config in worker processes it
 * spawns *after* the main process finished loading the config — they inherit
 * the marker and skip the rebuild.
 */
const BUILT_MARKER = "LOOM_NEXT_GALLERY_BUILT";

/**
 * Emit the static gallery into `public/<base>`, once per `next build`. A build
 * failure propagates — a broken gallery should fail the app build the same way
 * the Astro embed's build hook would — but *zero targets* only warns and skips,
 * so adding the wrapper before writing the first `*.loom.tsx` doesn't brick
 * `next build`.
 */
async function buildStaticGalleryOnce(
	options: LoomNextOptions,
	base: string,
): Promise<void> {
	const built = process.env[BUILT_MARKER]?.split(",") ?? [];
	if (built.includes(base)) return;
	const { buildGallery, findGalleryTargets } = await import("./embed.ts");
	if (findGalleryTargets(options.root, options.targets ?? true).length === 0) {
		console.warn(
			`loom: no gallery targets under ${options.root} — skipping the static gallery build`,
		);
	} else {
		const outDir = staticGalleryOutDir(base);
		await buildGallery({
			root: options.root,
			targets: options.targets ?? true,
			outDir,
			base,
			...(options.shims ? { shims: options.shims } : {}),
		});
		console.log(`loom: static gallery → ${outDir}`);
	}
	// The skip case is marked too: rescanning (and re-warning) once per worker
	// process would drown the build output.
	process.env[BUILT_MARKER] = [...built, base].join(",");
}

/**
 * Wrap a Next config so the app serves the loom gallery under `base`.
 *
 * ```ts
 * // next.config.ts
 * import { withLoomGallery } from "loom-dev/next";
 * export default withLoomGallery(
 *   { reactStrictMode: true },
 *   { root: "../my-ui", targets: "src/scenes" },
 * );
 * ```
 *
 * The result is a Next *function config* — that is how the wrapper learns the
 * phase, which drives everything: `next dev` boots the proxied gallery lazily
 * on the first `rewrites()` call (in the process that actually serves, so a
 * config evaluated in several processes starts exactly one Vite instance);
 * `next build` emits the static gallery into `public/<base>`; `next start`
 * just serves it. Accepts the user's config as an object or as a function of
 * its own — apply this wrapper outermost when composing with object-shaped
 * wrappers.
 */
export function withLoomGallery<C extends object>(
	nextConfig: C | ((phase: string, context: unknown) => C | Promise<C>),
	options: LoomNextOptions,
): NextConfigPhaseFn<C> {
	const resolvedOptions = resolveLoomNextOptions(options);
	const base = normalizeBase(resolvedOptions.base);
	// One gallery per process, however many times Next re-asks for rewrites
	// (config reloads re-invoke the function; the server survives them all).
	let server: Promise<Pick<StandaloneGalleryServer, "origin">> | undefined;
	const ensureServer = (): Promise<Pick<StandaloneGalleryServer, "origin">> => {
		server ??= startGalleryServer({
			root: resolvedOptions.root,
			targets: resolvedOptions.targets ?? true,
			base,
			...(resolvedOptions.port !== undefined
				? { port: resolvedOptions.port }
				: {}),
			...(resolvedOptions.hmrPort !== undefined
				? { hmrPort: resolvedOptions.hmrPort }
				: {}),
			...(resolvedOptions.shims ? { shims: resolvedOptions.shims } : {}),
		}).catch((err) => {
			// Only memoize a successful boot, so a transient failure (a pinned
			// port still busy, a half-written config) is retried next time Next
			// asks for the rewrites instead of replayed forever.
			server = undefined;
			throw err;
		});
		return server;
	};
	return async (phase, context) => {
		// `C extends object` and a cast, not `extends NextConfigLike`: an
		// all-optional constraint would trip TS's weak-type check for configs
		// with none of its properties, and the real `NextConfig` type must keep
		// passing through.
		const resolved =
			typeof nextConfig === "function"
				? await nextConfig(phase, context)
				: nextConfig;
		if (
			phase === PHASE_PRODUCTION_BUILD &&
			resolvedOptions.staticBuild !== false
		) {
			await buildStaticGalleryOnce(resolvedOptions, base);
		}
		const rewrites = createLoomRewrites(
			(resolved as NextConfigLike).rewrites,
			base,
			{ dev: phase === PHASE_DEVELOPMENT_SERVER, ensureServer },
		);
		return { ...resolved, rewrites };
	};
}
