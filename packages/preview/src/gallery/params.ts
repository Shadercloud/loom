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
	/**
	 * `?background=<css color>` → the exact stage backdrop, overriding whatever
	 * `theme` would have painted. Undefined when absent or unusable.
	 */
	background?: string;
	/** `?debug=1` → open the debug panel on load (see `./debug.ts`). */
	debug: boolean;
}

/** The `?debug=` spellings that mean "off"; anything else present means on. */
const DEBUG_OFF = new Set(["0", "false", "off", "no", "none"]);

/**
 * Read one `?debug=` value. A bare `?debug` (no `=`) is on, which is how a
 * flag is usually typed by hand; `?debug=0` and friends are off, so a host page
 * templating the param can pass a boolean straight through.
 */
export function parseDebugFlag(raw: string | null | undefined): boolean {
	if (raw === null || raw === undefined) return false;
	return !DEBUG_OFF.has(raw.trim().toLowerCase());
}

/**
 * The colour forms `?background=` accepts.
 *
 * Deliberately an allowlist rather than "whatever the browser takes": the value
 * arrives in a URL and lands in an inline style, so `url(...)` — a network
 * fetch driven by a query param — must not be reachable. The functional forms
 * match their arguments with a character class that excludes `(`, so no
 * argument can open a nested function either.
 *
 * A bare identifier (`white`, `rebeccapurple`) passes the shape test without
 * being checked against the named-colour list; a typo simply fails to apply in
 * the browser and the themed default stands.
 */
const COLOR_FUNCTIONS = "rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|light-dark";

/**
 * Source rather than a literal: the generated page's first-paint script
 * (`./boot.ts`) rebuilds these from the same strings, so the pre-bundle paint
 * and {@link parseBackgroundColor} can never drift apart.
 */
export const BACKGROUND_COLOR_PATTERN = `^(?:#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|[a-z]+|(?:${COLOR_FUNCTIONS})\\([#0-9a-z%.,+/\\s-]*\\))$`;

/** Hex digits with no `#` — see {@link parseBackgroundColor}. */
export const BARE_HEX_PATTERN = "^(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$";

const CSS_COLOR = new RegExp(BACKGROUND_COLOR_PATTERN, "i");
const BARE_HEX = new RegExp(BARE_HEX_PATTERN, "i");

/**
 * Read one `?background=` value: trimmed, hex-normalised, and filtered through
 * {@link CSS_COLOR}. Returns undefined for anything absent, empty or rejected,
 * which every caller reads as "keep the theme's own backdrop".
 *
 * `#` opens the URL fragment (and the gallery routes on the hash), so a literal
 * `?background=#ffffff` never survives the trip. Both spellings that do are
 * accepted: percent-encoded (`%23ffffff`) and bare digits (`ffffff`). No CSS
 * named colour is spelled with hex digits alone, so the bare form is
 * unambiguous.
 */
export function parseBackgroundColor(
	raw: string | null | undefined,
): string | undefined {
	if (raw === null || raw === undefined) return undefined;
	const value = raw.trim();
	if (value === "") return undefined;
	const normalized = BARE_HEX.test(value) ? `#${value}` : value;
	return CSS_COLOR.test(normalized) ? normalized : undefined;
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
		background: parseBackgroundColor(params.get("background")),
		debug: parseDebugFlag(params.get("debug")),
	};
}
