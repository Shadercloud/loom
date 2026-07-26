/**
 * Filesystem anchors for everything the preview hands to Vite.
 *
 * The browser-facing modules are always referenced by their TypeScript
 * *source*, never the build output: Vite transpiles them inside the previewed
 * project, and pointing at one fixed location keeps a workspace checkout and a
 * published install identical. `src/` ships in the tarball (see the package's
 * `files`), and it sits one level under the package root either way — these
 * modules run from `src/` in the workspace and from `dist/` once installed, so
 * `../src` resolves to the same directory in both.
 */
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** The shipped `src/` directory of this package. */
export const PREVIEW_SRC = fileURLToPath(new URL("../src", import.meta.url));

/**
 * A directory guaranteed to contain the sources above, for Vite's
 * `server.fs.allow`: the repo root in a workspace checkout, the installing
 * project's `node_modules` once published.
 */
export const LOOM_REPO_ROOT = resolve(PREVIEW_SRC, "../../..");

/** `@rbxts/react-roblox` stand-in (`createRoot`). */
export const CLIENT_PATH = join(PREVIEW_SRC, "client.ts");
/** `@rbxts/services` stand-in. */
export const SERVICES_PATH = join(PREVIEW_SRC, "services.ts");
/** `@rbxts/react` shim: React plus the `Event`/`Change` keyed-prop namespaces. */
export const REACT_SHIM_PATH = join(PREVIEW_SRC, "react-shim.js");
/** Installs the Roblox datatype globals; imported first by every entry. */
export const GLOBALS_PATH = join(PREVIEW_SRC, "globals.ts");
/** The shared gallery shell (dev server and static build both start here). */
export const GALLERY_SHELL_PATH = join(
	PREVIEW_SRC,
	"gallery",
	"gallery-shell.ts",
);
/** The dev-server gallery boot: pulls `virtual:loom-targets`, then the shell. */
export const GALLERY_DEV_SHELL_PATH = join(PREVIEW_SRC, "gallery", "shell.ts");
