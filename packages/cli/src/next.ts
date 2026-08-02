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
 *
 * An app with a `basePath` (a GitHub Pages project site, a docs app under
 * `/docs`) makes the gallery's mount and its browser-visible URL two different
 * strings, so the module keeps them apart throughout — see {@link GalleryBases}.
 * The `basePath` is read off the *resolved* config, after any wrapper this one
 * composes with has run.
 */
import { createServer as createHttpServer } from "node:http";
import { join, resolve } from "node:path";
// Type-only: the value import happens lazily inside the dev path so evaluating
// a next.config that uses `withLoomGallery` (every `next build` / `next start`)
// doesn't pay for loading Vite.
import type { GalleryEmbedOptions } from "./embed.ts";

/** Where the gallery is mounted when the host doesn't say (mirrors embed.ts). */
const DEFAULT_BASE = "/loom-preview/";

/**
 * Normalize a mount path to the `/…/` shape (same rule as `loom-dev/embed`).
 * This is the **mount base**: where the gallery sits relative to the Next app,
 * never including Next's own `basePath` (see {@link GalleryBases}).
 */
function normalizeBase(base?: string): string {
	if (typeof base !== "string") return DEFAULT_BASE;
	// Segment-wise, so a doubled or missing separator can't reach the composed
	// public base as `//` — that would read as a protocol-relative URL.
	const segments = base.split("/").filter(Boolean);
	return segments.length === 0 ? DEFAULT_BASE : `/${segments.join("/")}/`;
}

/**
 * Normalize Next's `basePath` to `""` or `/segment(/segment)*` — no trailing
 * slash, so it composes by plain concatenation with a `/…/` mount base.
 *
 * Deliberately tolerant of shapes Next itself would reject (a missing leading
 * slash, doubled separators): the value reaches us from a user config that may
 * still be in flight, and a wrong guess here silently mis-points every gallery
 * asset. An origin (`https://cdn.example.com`) is *not* a base path — that is
 * `assetPrefix`'s job — so it is dropped rather than concatenated into a URL
 * that would look same-origin but not be.
 */
export function normalizeNextBasePath(value: unknown): string {
	if (typeof value !== "string") return "";
	const trimmed = value.trim();
	if (trimmed === "" || trimmed === "/") return "";
	if (/^[a-z][a-z\d+.-]*:/i.test(trimmed)) {
		console.warn(
			`loom: ignoring a basePath that looks like a URL (${trimmed}) — ` +
				"the gallery base is composed from a path-only Next basePath",
		);
		return "";
	}
	const segments = trimmed.split("/").filter(Boolean);
	return segments.length === 0 ? "" : `/${segments.join("/")}`;
}

/**
 * The browser-visible gallery prefix: Next's `basePath` followed by the loom
 * mount base. String concatenation of two normalized URL paths, never
 * `path.join()` — on Windows that would emit `\` into a URL.
 *
 * ```ts
 * composeGalleryPublicBase("", "/loom-preview/");          // "/loom-preview/"
 * composeGalleryPublicBase("/docs/", "previews");          // "/docs/previews/"
 * ```
 */
export function composeGalleryPublicBase(
	nextBasePath: unknown,
	mountBase: string,
): string {
	const prefix = normalizeNextBasePath(nextBasePath);
	const mount = normalizeBase(mountBase);
	return `${prefix}${mount}`;
}

/**
 * The two bases a gallery under a Next app has, which are the same string only
 * when the app has no `basePath`:
 *
 * - {@link mountBase} — the mount *relative to the Next app*. Next rewrites are
 *   declared with it (Next prefixes `basePath` onto every `source` itself), and
 *   `public/<mountBase>` is where the static gallery is written.
 * - {@link publicBase} — what the browser actually sees. Vite's `base` for the
 *   gallery, so generated HTML, chunk URLs, dynamic imports and runtime URLs
 *   all point below the deployed prefix.
 */
export interface GalleryBases {
	/** `/loom-preview/` — the mount relative to the Next app. */
	mountBase: string;
	/** `/docs/loom-preview/` — the deployed, browser-visible prefix. */
	publicBase: string;
}

/** Double-prefix warnings already emitted, so a re-read config doesn't spam. */
const warnedDoublePrefix = new Set<string>();

/**
 * Catch the pre-`basePath`-support workaround: a Loom `base` that already
 * repeats the Next `basePath`, which now composes into `/docs/docs/preview/`.
 * Only an exact segment-boundary repeat warns, so a genuinely nested mount
 * (`/docs-previews/`, `/a/b/`) stays quiet.
 */
function warnOnDoublePrefix(nextBasePath: string, mountBase: string): void {
	if (nextBasePath === "" || !mountBase.startsWith(`${nextBasePath}/`)) return;
	const key = `${nextBasePath}${mountBase}`;
	if (warnedDoublePrefix.has(key)) return;
	warnedDoublePrefix.add(key);
	console.warn(
		`loom: the gallery base ${mountBase} already starts with Next's basePath ` +
			`(${nextBasePath}), so the gallery will be served at ` +
			`${nextBasePath}${mountBase} — loom adds the basePath itself. Drop it ` +
			"from the loom `base` option unless that nesting is intentional.",
	);
}

/**
 * Derive both bases from a resolved Next config's `basePath` and the loom
 * `base` option. The single place the two concepts are related.
 */
export function resolveGalleryBases(
	nextBasePath: unknown,
	base?: string,
): GalleryBases {
	const prefix = normalizeNextBasePath(nextBasePath);
	const mountBase = normalizeBase(base);
	warnOnDoublePrefix(prefix, mountBase);
	return { mountBase, publicBase: composeGalleryPublicBase(prefix, mountBase) };
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
	/** Next's own deployment prefix — see {@link GalleryBases}. */
	basePath?: string;
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
	/**
	 * Where the gallery is mounted **relative to the Next app**. Defaults to
	 * `/loom-preview/`. Next's own `basePath` is added automatically, so an app
	 * with `basePath: "/docs"` serves this default at `/docs/loom-preview/` —
	 * do not repeat the deployment prefix here.
	 */
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
	/**
	 * `false` stops the `next build` static gallery downloading the
	 * `rbxassetid://` images it mentions — see `GalleryEmbedOptions.assets`. The
	 * dev gallery is unaffected: it has a server to resolve ids with.
	 */
	assets?: boolean;
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
 * The dev-mode proxy rules for a gallery at `origin`. Sources are declared with
 * the **mount** base: Next prefixes its own `basePath` onto every rewrite
 * source, so writing `/loom-preview/:path*` here is what makes the rule match
 * `/docs/loom-preview/…` under `basePath: "/docs"`. Destinations carry the
 * **public** base instead — Next leaves an external (`http://…`) destination
 * alone, and the gallery's Vite instance is itself mounted at `publicBase` so
 * that the URLs it generates work in the browser.
 *
 * The bare-path rule comes first and targets the slashed upstream URL
 * directly — routing it through the catch-all would trigger the middleware's
 * `301 → /base/`, which Next's trailing-slash normalization bounces right
 * back (see the module doc).
 */
export function loomDevRewrites(
	bases: GalleryBases,
	origin: string,
): NextRewrite[] {
	const bare = bases.mountBase.slice(0, -1);
	const upstream = `${origin}${bases.publicBase}`;
	return [
		{ source: bare, destination: upstream },
		{ source: `${bare}/:path*`, destination: `${upstream}:path*` },
	];
}

/**
 * The production rule: Next serves `public/` files only at their exact paths,
 * so the bare mount of a statically built gallery needs an explicit map onto
 * its `index.html`. Harmless when nothing was built there (the destination
 * 404s the same way the source would have).
 *
 * Both sides are mount-relative and internal, so Next prefixes its `basePath`
 * onto each of them — the rule keeps working at `/docs/loom-preview` without
 * loom ever naming `/docs`.
 */
export function loomStaticRewrites(mountBase: string): NextRewrite[] {
	return [
		{ source: mountBase.slice(0, -1), destination: `${mountBase}index.html` },
	];
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
	bases: GalleryBases,
	env: LoomRewritesEnv,
): () => Promise<NextRewriteGroups> {
	return async () => {
		const user = await userRewrites?.();
		if (!env.dev) {
			return mergeRewrites(user, {
				afterFiles: loomStaticRewrites(bases.mountBase),
			});
		}
		try {
			const { origin } = await env.ensureServer();
			return mergeRewrites(user, {
				beforeFiles: loomDevRewrites(bases, origin),
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

/**
 * `public/<mountBase>` as a relative path (`/loom-preview/` →
 * `public/loom-preview`). The *mount* base, never the public one: the deployed
 * prefix is Next's to add when it serves `public/`, so a `basePath` must not
 * show up as a directory (`public/docs/loom-preview` would be served at
 * `/docs/docs/loom-preview`).
 */
export function staticGalleryOutDir(mountBase: string): string {
	return join("public", ...mountBase.split("/").filter(Boolean));
}

/**
 * Cross-process once-guard for {@link buildStaticGalleryOnce}. An env var, not
 * a module flag: `next build` re-evaluates the config in worker processes it
 * spawns *after* the main process finished loading the config — they inherit
 * the marker and skip the rebuild.
 */
const BUILT_MARKER = "LOOM_NEXT_GALLERY_BUILT";

/**
 * What one already-built gallery is recorded as in {@link BUILT_MARKER}. The
 * pair identifies the *build*: two configs that emit to the same `public/`
 * directory still differ if their public base does, and inheriting a marker
 * across them would ship a gallery whose asset URLs point at the wrong prefix.
 * Both halves are project-relative — nothing machine-specific leaks into the
 * environment of every child process.
 */
export function galleryBuildMarker(publicBase: string, outDir: string): string {
	return `${publicBase}|${outDir}`;
}

/**
 * Emit the static gallery into `public/<base>`, once per `next build`. A build
 * failure propagates — a broken gallery should fail the app build the same way
 * the Astro embed's build hook would — but *zero targets* only warns and skips,
 * so adding the wrapper before writing the first `*.loom.tsx` doesn't brick
 * `next build`.
 */
async function buildStaticGalleryOnce(
	options: LoomNextOptions,
	bases: GalleryBases,
): Promise<void> {
	const outDir = staticGalleryOutDir(bases.mountBase);
	const marker = galleryBuildMarker(bases.publicBase, outDir);
	const built = process.env[BUILT_MARKER]?.split(",") ?? [];
	if (built.includes(marker)) return;
	const { buildGallery, findGalleryTargets } = await import("./embed.ts");
	if (findGalleryTargets(options.root, options.targets ?? true).length === 0) {
		console.warn(
			`loom: no gallery targets under ${options.root} — skipping the static gallery build`,
		);
	} else {
		await buildGallery({
			root: options.root,
			targets: options.targets ?? true,
			outDir,
			// The browser-visible prefix, so the emitted html/chunk/dynamic-import
			// URLs resolve under a deployed `basePath` — including a static export,
			// which has no rewrites to fix them up at request time.
			base: bases.publicBase,
			...(options.shims ? { shims: options.shims } : {}),
			...(options.assets === false ? { assets: false } : {}),
		});
		console.log(`loom: static gallery → ${outDir} (base ${bases.publicBase})`);
	}
	// The skip case is marked too: rescanning (and re-warning) once per worker
	// process would drown the build output.
	process.env[BUILT_MARKER] = [...built, marker].join(",");
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
 *
 * The config's `basePath` is picked up automatically: the gallery keeps its
 * `public/<base>` home, and its assets are generated for
 * `<basePath><base>` — the URL the browser really loads them from.
 */
export function withLoomGallery<C extends object>(
	nextConfig: C | ((phase: string, context: unknown) => C | Promise<C>),
	options: LoomNextOptions,
): NextConfigPhaseFn<C> {
	const resolvedOptions = resolveLoomNextOptions(options);
	// One gallery per process, however many times Next re-asks for rewrites
	// (config reloads re-invoke the function; the server survives them all).
	// Keyed by the public base the gallery was booted for, which is what its
	// Vite instance is mounted at.
	const servers = new Map<
		string,
		Promise<Pick<StandaloneGalleryServer, "origin">>
	>();
	const ensureServer = (
		publicBase: string,
	): Promise<Pick<StandaloneGalleryServer, "origin">> => {
		const running = servers.get(publicBase);
		if (running) return running;
		const pending = startGalleryServer({
			root: resolvedOptions.root,
			targets: resolvedOptions.targets ?? true,
			base: publicBase,
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
			servers.delete(publicBase);
			throw err;
		});
		servers.set(publicBase, pending);
		return pending;
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
		// Only now: `basePath` may be set (or rewritten) by the wrapper this one
		// composes with (`withMDX(config)`) or by the user's own function config,
		// so the argument before resolution is not the config Next will use.
		const bases = resolveGalleryBases(
			(resolved as NextConfigLike).basePath,
			resolvedOptions.base,
		);
		if (
			phase === PHASE_PRODUCTION_BUILD &&
			resolvedOptions.staticBuild !== false
		) {
			await buildStaticGalleryOnce(resolvedOptions, bases);
		}
		const rewrites = createLoomRewrites(
			(resolved as NextConfigLike).rewrites,
			bases,
			{
				dev: phase === PHASE_DEVELOPMENT_SERVER,
				ensureServer: () => ensureServer(bases.publicBase),
			},
		);
		return { ...resolved, rewrites };
	};
}
