/**
 * The generated gallery page's first-paint boot: the `<style>` and `<script>`
 * that go in its `<head>`, above everything else.
 *
 * Without them the page paints its backdrop twice. The stylesheet (bundled into
 * the JS graph, so JS-injected under the dev server and a render-blocking
 * `<link>` in the build) can only carry a *fixed* colour, and the URL's
 * `?theme=` / `?background=` are read by `startGallery` — which runs after the
 * bundle, the WASM layout engine and the target chunk have all loaded. A light
 * or custom backdrop therefore arrived as a flash of dark, most visibly on a
 * docs page that reloads the iframe whenever a control changes a param.
 *
 * So the backdrop is decided here instead, from `location.search` alone, before
 * the first paint — and the stylesheet no longer paints one at all. Everything
 * downstream (`gallery-shell.ts`'s live theme/background switching) writes to
 * the same `<html>` element this does.
 *
 * Kept out of the browser graph: `html.ts` inlines these strings into the
 * document it generates, so nothing here is ever imported by the shell.
 */
import { BACKGROUND_COLOR_PATTERN, BARE_HEX_PATTERN } from "./params.ts";

/** The dark (default) backdrop — lattice's `defaultDarkTheme` background. */
export const DARK_BACKDROP = "#14161a";

/** The `?theme=light` backdrop — lattice's `defaultLightTheme` background. */
export const LIGHT_BACKDROP = "#f6f9fc";

/**
 * First-paint CSS. Owns the backdrop outright (`shell.css` deliberately sets
 * none), so the colour painted before the bundle lands is the final one.
 */
export const GALLERY_BOOT_STYLE = `html, body { margin: 0; height: 100%; overscroll-behavior: none; }
			html { background: ${DARK_BACKDROP}; color-scheme: dark; }
			html.loom-theme-light { background: ${LIGHT_BACKDROP}; color-scheme: light; }`;

/**
 * First-paint script: applies `?theme=` and `?background=` to `<html>` while
 * the head is still parsing. It repeats the read `parseGalleryParams` does
 * later — the shell can't be reached this early — but not the patterns behind
 * it, which are imported. `gallery/boot.test.ts` pins the two readings together
 * over a shared table of inputs.
 *
 * Wrapped in try/catch: a browser that trips over anything here must still get
 * a working gallery, just with the flash back.
 */
export const GALLERY_BOOT_SCRIPT = `(function () {
				try {
					var params = new URLSearchParams(location.search);
					if (params.get("theme") === "light")
						document.documentElement.classList.add("loom-theme-light");
					var raw = (params.get("background") || "").trim();
					if (new RegExp(${JSON.stringify(BARE_HEX_PATTERN)}, "i").test(raw)) raw = "#" + raw;
					if (raw && new RegExp(${JSON.stringify(BACKGROUND_COLOR_PATTERN)}, "i").test(raw))
						document.documentElement.style.background = raw;
				} catch (error) {}
			})();`;
