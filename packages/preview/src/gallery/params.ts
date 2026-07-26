/**
 * The built gallery's URL contract — browser-safe (no node imports), so the
 * bundled shell can import it without dragging `node:fs`/`node:path` into the
 * browser graph. Re-exported from `../gallery` for the node-side test.
 */

/** The query params the built gallery understands. */
export interface GalleryParams {
	/** Selected target relPath (from `?target=`), if any. */
	target?: string;
	/** `?chrome=none` → hide the sidebar and render one target full-bleed. */
	chromeless: boolean;
	/** `?theme=light|dark` → stage background + `PlayerGui.LoomTheme` seed. */
	theme: "light" | "dark";
}

/**
 * Parse the built gallery's URL contract from a `location.search` string.
 * The docs-site iframes deep-link a single target with
 * `?target=<relPath>&chrome=none`. `chrome=none` is the only chromeless value;
 * anything else (including absent) keeps the full sidebar chrome.
 */
export function parseGalleryParams(search: string): GalleryParams {
	const params = new URLSearchParams(
		search.startsWith("?") ? search.slice(1) : search,
	);
	const target = params.get("target") ?? undefined;
	return {
		target: target || undefined,
		chromeless: params.get("chrome") === "none",
		theme: params.get("theme") === "light" ? "light" : "dark",
	};
}
