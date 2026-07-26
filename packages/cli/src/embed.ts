/**
 * `loom-dev/embed` — mount the loom gallery inside someone else's toolchain.
 *
 * `loom preview` / `loom build` own the whole process: they create a Vite server
 * (or run a Vite build) and that is the program. A docs site can't use either —
 * its own dev server owns the port, and its own build owns the output dir. The
 * pre-`embed` workaround was to shell out to `loom build` before every docs
 * build and commit the static SPA into the site's `public/`, which meant no HMR
 * and a generated artifact that went stale whenever the scenes changed.
 *
 * This module exposes the same two pipelines programmatically instead:
 *
 * - {@link createGalleryServer} — a gallery Vite server in **middleware mode**,
 *   mountable on a host dev server under a public `base` (default
 *   `/loom-preview/`). The host forwards matching requests and gets the full
 *   dev experience — target discovery, per-target HMR, the error panel.
 * - {@link buildGallery} — the static build ({@link runBuild}) with a host-shaped
 *   signature, for the host's "build finished, emit your assets" hook.
 *
 * Both keep loom's module graph in its **own** Vite instance: the plugin aliases
 * `react` and `@rbxts/*` globally (see `@loom-dev/preview/vite`), which would
 * hijack a host app's own React if the plugin were dropped into the host's
 * config. Isolation is the point — the host only ever forwards HTTP.
 */
import { existsSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
// Statically imported, not `await import`ed: a host may load this module through
// its own module runner (Astro does), and a dynamic import evaluated later can
// land after that runner has closed.
import { createServer as createNetServer } from "node:net";
import { resolve } from "node:path";
import { LOOM_REPO_ROOT } from "@loom-dev/preview/gallery";
import { loomPreview } from "@loom-dev/preview/vite";
import { createServer, type ViteDevServer } from "vite";
import { runBuild } from "./build.ts";
import {
	findLoomTargets,
	findWorkspaceRoot,
	normalizeTargetsPatterns,
} from "./gallery.ts";

/** Where the gallery is mounted when the host doesn't say. */
export const DEFAULT_GALLERY_BASE = "/loom-preview/";

export interface GalleryEmbedOptions {
	/** Project dir whose `*.loom.tsx` targets are served (resolved against cwd). */
	root: string;
	/**
	 * Target discovery: a glob, a directory, a list of either, or `true` for the
	 * default `**\/*.loom.tsx`. Same semantics as the CLI's `--targets`.
	 */
	targets?: string | string[] | true;
	/** Public path the gallery is served under. Defaults to `/loom-preview/`. */
	base?: string;
	/**
	 * The HMR WebSocket port. Middleware mode has no HTTP server of its own to
	 * upgrade, so Vite always puts HMR on a standalone port — and its default
	 * (24678) is the one every other Vite dev server reaches for first, which
	 * makes a collision (a second docs server, a stray Vite) likely. A busy port
	 * is not fatal, but it is silent: Vite logs `Port 24678 is already in use`
	 * and previews then never hot-reload.
	 *
	 * Left unset, an ephemeral free port is picked per server. Pass a number to
	 * pin one, or `false` to run without HMR (edits then need a frame reload).
	 */
	hmrPort?: number | false;
}

export interface GalleryServer {
	/** The normalized base (always `/…/`) the middleware answers under. */
	base: string;
	/**
	 * Connect-style middleware: requests under {@link base} are served by the
	 * gallery, everything else is passed straight to `next()`.
	 */
	middleware: (
		req: IncomingMessage,
		res: ServerResponse,
		next: (err?: unknown) => void,
	) => void;
	/** The underlying Vite dev server, for hosts that need to reach into it. */
	vite: ViteDevServer;
	/** Shut the gallery server (and its HMR socket) down. */
	close(): Promise<void>;
}

/** Normalize a mount path to the `/…/` shape Vite's `base` expects. */
export function normalizeGalleryBase(base?: string): string {
	if (!base || base === "/" || base === "") return DEFAULT_GALLERY_BASE;
	const withLeading = base.startsWith("/") ? base : `/${base}`;
	return withLeading.endsWith("/") ? withLeading : `${withLeading}/`;
}

/** The targets a gallery would serve — for hosts that skip when there are none. */
export function findGalleryTargets(
	root: string,
	targets: string | string[] | true = true,
): string[] {
	return findLoomTargets(
		resolve(process.cwd(), root),
		normalizeTargetsPatterns(targets),
	);
}

/**
 * Ask the OS for a free port by binding one and letting go. Racy in principle
 * (something else could take it in between), but the alternative — Vite's fixed
 * default — collides by construction rather than by chance.
 */
async function findFreePort(): Promise<number> {
	return new Promise((resolvePort, reject) => {
		const probe = createNetServer();
		probe.unref();
		probe.on("error", reject);
		probe.listen(0, "127.0.0.1", () => {
			const address = probe.address();
			const port = typeof address === "object" && address ? address.port : 0;
			probe.close(() => {
				port ? resolvePort(port) : reject(new Error("no free port"));
			});
		});
	});
}

/**
 * Whether a request URL belongs to a gallery mounted at `base` (normalized).
 * Both `/loom-preview` (the bare mount) and anything under `/loom-preview/`
 * count; a sibling path that merely shares the prefix (`/loom-previews/x`) does
 * not. Exported so a host can route without duplicating the rule.
 */
export function isGalleryRequest(url: string, base: string): boolean {
	const pathname = url.split("?")[0]?.split("#")[0] ?? url;
	return pathname === base.slice(0, -1) || pathname.startsWith(base);
}

/**
 * Create a gallery Vite server in middleware mode, for mounting on a host dev
 * server (an Astro/Express/Connect app). Nothing listens on a port of its own —
 * except Vite's HMR WebSocket, which middleware mode always puts on a port of
 * its own — a free one by default (see {@link GalleryEmbedOptions.hmrPort}).
 *
 * The returned middleware answers only under `base`; a host can register it
 * before its own routes without shadowing them.
 */
export async function createGalleryServer(
	options: GalleryEmbedOptions,
): Promise<GalleryServer> {
	const root = resolve(process.cwd(), options.root);
	if (!existsSync(root)) {
		throw new Error(`loom: gallery root not found: ${root}`);
	}
	const base = normalizeGalleryBase(options.base);
	const patterns = normalizeTargetsPatterns(options.targets ?? true);

	// The gallery shell is served out of this package via /@fs/, and the targets
	// may live in a workspace of their own — both trees must be readable.
	const fsAllow = [
		...new Set([root, findWorkspaceRoot(root), LOOM_REPO_ROOT]),
	].filter((path): path is string => typeof path === "string");

	// `false` disables HMR outright; a number pins the socket; unset means "any
	// free port", which keeps two embedded galleries (or a stray Vite) from
	// fighting over 24678.
	const hmr =
		options.hmrPort === false
			? (false as const)
			: { port: options.hmrPort ?? (await findFreePort()) };

	const vite = await createServer({
		root,
		base,
		configFile: false, // loom owns the config; ignore any project vite.config
		// The host owns `/` — never let Vite's html/SPA fallback answer for it.
		appType: "custom",
		plugins: [loomPreview({ targets: patterns })],
		server: { middlewareMode: true, fs: { allow: fsAllow }, hmr },
	});

	return {
		base,
		vite,
		middleware(req, res, next) {
			const url = req.url ?? "/";
			if (!isGalleryRequest(url, base)) return next();
			// The bare mount without its trailing slash: relative asset URLs in the
			// gallery HTML would resolve one level too high, so redirect first.
			if ((url.split("?")[0] ?? url) === base.slice(0, -1)) {
				res.statusCode = 301;
				res.setHeader("Location", base + url.slice(base.length - 1));
				res.end();
				return;
			}
			vite.middlewares(req, res, next);
		},
		close() {
			return vite.close();
		},
	};
}

export interface GalleryBuildOptions extends GalleryEmbedOptions {
	/** Directory the static gallery is emitted into (resolved against cwd). */
	outDir: string;
}

/**
 * Build the static gallery into `outDir` — the host's build-time counterpart to
 * {@link createGalleryServer}. `base` defaults to `./` (relative assets, so the
 * output works under any public path); pass the mount path when the host serves
 * it from a fixed location and wants absolute URLs.
 */
export async function buildGallery(
	options: GalleryBuildOptions,
): Promise<string> {
	return runBuild({
		dir: options.root,
		targets: options.targets ?? true,
		out: options.outDir,
		base: options.base ?? "./",
	});
}
