/**
 * The dev-server half of gallery mode: `loomGallery(patterns)` serves
 * `virtual:loom-targets` — a lazy import map of every `*.loom.tsx` under the
 * project — and invalidates it (with a full reload) when target files appear or
 * disappear.
 *
 * The generated gallery page itself comes from `loomIndexHtml({ patterns })`
 * (see `./html.ts`); it loads the browser shell as a real file in this package,
 * reached through Vite's `/@fs/` URL space, so no package.json exports are
 * needed for browser code. Under `build` this plugin is inert — the generated
 * entry there imports a *real* generated targets module instead, so Rollup can
 * code-split each target into its own async chunk.
 */
import type { Plugin } from "vite";
import {
	findLoomTargets,
	generateTargetsModule,
	toViteFsUrl,
} from "./gallery.ts";
import { GALLERY_DEV_SHELL_PATH, LOOM_REPO_ROOT } from "./paths.ts";

const TARGETS_ID = "virtual:loom-targets";
const TARGETS_RESOLVED = `\0${TARGETS_ID}`;

/** The dev shell's `/@fs/` URL — the module script of the generated page. */
export const GALLERY_SHELL_URL = toViteFsUrl(GALLERY_DEV_SHELL_PATH);

/** Serve + watch the `virtual:loom-targets` import map. */
export function loomGallery(patterns: string[]): Plugin {
	let root = process.cwd();
	return {
		name: "loom-preview:gallery-targets",
		apply: "serve",
		// The shell (and its css) are served from the loom package via /@fs/, so
		// the dev server must be allowed to read them even when the project sits
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
