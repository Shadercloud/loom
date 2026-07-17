/**
 * Gallery-mode Vite plugins for the loom CLI.
 *
 * - `loomGallery(patterns)` serves `virtual:loom-targets` — a lazy import map
 *   of every `*.loom.tsx` under the project — and invalidates it (with a full
 *   reload) when target files appear or disappear.
 * - `loomGalleryIndexHtml()` serves the gallery index.html: sidebar + stage
 *   divs plus a module script for the plain-DOM shell. The shell is a real
 *   file in this package, reached through Vite's `/@fs/` URL space, so no
 *   package.json exports are needed for browser code.
 *
 * These are dev-server plugins executed under tsx by the CLI; they live here
 * (not in @loom-dev/preview) so the preview package's public surface stays
 * untouched.
 */
import { sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { findLoomTargets, generateTargetsModule } from "./gallery";

const TARGETS_ID = "virtual:loom-targets";
const TARGETS_RESOLVED = `\0${TARGETS_ID}`;

const toPosix = (p: string): string => p.split(sep).join("/");

/** The loom repo root (this file lives at <root>/packages/cli/src/). */
export const LOOM_REPO_ROOT = fileURLToPath(
	new URL("../../..", import.meta.url),
).replace(/[/\\]+$/, "");

const SHELL_PATH = fileURLToPath(new URL("gallery/shell.ts", import.meta.url));
const SHELL_URL = `/@fs${toPosix(SHELL_PATH)}`;

/** Serve + watch the `virtual:loom-targets` import map. */
export function loomGallery(patterns: string[]): Plugin {
	let root = process.cwd();
	return {
		name: "loom:gallery-targets",
		apply: "serve",
		// The shell (and its css) are served from the loom repo via /@fs/, so the
		// dev server must be allowed to read them even when the project sits
		// outside the loom workspace. Arrays are concat-merged by Vite.
		config() {
			return { server: { fs: { allow: [LOOM_REPO_ROOT] } } };
		},
		configResolved(config) {
			root = config.root;
		},
		resolveId(id) {
			if (id === TARGETS_ID) return TARGETS_RESOLVED;
		},
		load(id) {
			if (id !== TARGETS_RESOLVED) return;
			const relPaths = findLoomTargets(root, patterns);
			if (relPaths.length === 0) {
				this.warn(
					`no targets matched ${patterns.join(", ")} under ${root} — the gallery will be empty`,
				);
			}
			return generateTargetsModule(root, relPaths);
		},
		configureServer(server) {
			const onFilesChanged = (file: string): void => {
				if (!file.endsWith(".loom.tsx")) return;
				const mod = server.moduleGraph.getModuleById(TARGETS_RESOLVED);
				if (mod) server.moduleGraph.invalidateModule(mod);
				// The shell rebuilds its whole sidebar from the import map, so a
				// full reload is the simplest correct signal; the hash (and thus
				// the selected target) survives the reload.
				server.ws.send({ type: "full-reload" });
			};
			server.watcher.on("add", onFilesChanged);
			server.watcher.on("unlink", onFilesChanged);
		},
	};
}

/** Serve the generated gallery index.html on `/`. */
export function loomGalleryIndexHtml(): Plugin {
	const html = `<!doctype html>
<html lang="en">
	<head>
		<meta charset="UTF-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1.0" />
		<title>loom gallery</title>
		<style>
			html, body { margin: 0; height: 100%; background: #14161a; }
		</style>
	</head>
	<body>
		<aside id="loom-gallery-sidebar"></aside>
		<main id="loom-gallery-stage">
			<div id="loom-root"></div>
		</main>
		<script type="module" src="${SHELL_URL}"></script>
	</body>
</html>`;
	return {
		name: "loom:gallery-index-html",
		apply: "serve",
		configureServer(server) {
			// Registered before Vite's internal middlewares (no post-hook wrapper):
			// in gallery mode the generated page wins even if the project ships its
			// own index.html.
			server.middlewares.use(async (req, res, next) => {
				const url = (req.url ?? "/").split("?")[0];
				if (url !== "/" && url !== "/index.html") return next();
				try {
					const out = await server.transformIndexHtml(
						url,
						html,
						req.originalUrl,
					);
					res.statusCode = 200;
					res.setHeader("Content-Type", "text/html");
					res.end(out);
				} catch (err) {
					next(err);
				}
			});
		},
	};
}
