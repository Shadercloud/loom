/**
 * `@loom-dev/layout` — typed async wrapper over the `loom-layout-wasm` engine.
 *
 * Hides the wasm-bindgen glue behind a small API:
 *   await initLayout();                       // load the wasm module once
 *   const result = computeLayout(scene, vp);  // sync, Roblox-accurate rects
 *
 * The generated `pkg/` is produced by `pnpm build:native` (gitignored).
 */

import type { LayoutResult, SceneNode, Viewport } from "@loom-dev/scene";
import initWasm, {
	computeLayout as rawComputeLayout,
} from "../pkg/loom_layout_wasm.js";

let loadOnce: Promise<unknown> | undefined;

/** Load the wasm layout engine. Idempotent; await before {@link computeLayout}. */
export function initLayout(): Promise<unknown> {
	if (!loadOnce) {
		const wasmUrl = new URL("../pkg/loom_layout_wasm_bg.wasm", import.meta.url);
		// Only memoize a SUCCESSFUL load; drop the cache on failure so a transient
		// init error (fetch 404, network blip) can be retried instead of replayed.
		loadOnce = initWasm({ module_or_path: wasmUrl }).catch((err) => {
			loadOnce = undefined;
			throw err;
		});
	}
	return loadOnce;
}

/**
 * Compute absolute pixel rects for a Roblox GUI tree. Call {@link initLayout}
 * first. Throws a `loom:`-prefixed error only when the scene/viewport is
 * malformed — the layout algorithm itself degrades, never errors.
 */
export function computeLayout(
	root: SceneNode,
	viewport: Viewport,
): LayoutResult {
	return rawComputeLayout(root, viewport) as LayoutResult;
}
