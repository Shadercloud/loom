/**
 * The generated page's first-paint boot. Two things are worth holding still:
 * that it paints the backdrop the URL asked for *before* the bundle exists, and
 * that its reading of `?background=` matches the shell's own — the snippet
 * repeats the parse (it cannot import at that point in the head), so the two
 * are checked against each other over one table of inputs.
 */
import { describe, expect, it } from "vitest";
import {
	DARK_BACKDROP,
	GALLERY_BOOT_SCRIPT,
	GALLERY_BOOT_STYLE,
	LIGHT_BACKDROP,
} from "./boot.ts";
import { parseBackgroundColor } from "./params.ts";

/** Run the snippet against a search string, as the head would. */
function boot(search: string): { background: string; themeLight: boolean } {
	document.documentElement.className = "";
	document.documentElement.removeAttribute("style");
	window.history.replaceState({}, "", `/loom-preview/${search}`);
	new Function(GALLERY_BOOT_SCRIPT)();
	return {
		background: document.documentElement.style.background,
		themeLight: document.documentElement.classList.contains("loom-theme-light"),
	};
}

describe("gallery boot style", () => {
	it("carries both themed backdrops, so neither waits on the stylesheet", () => {
		expect(GALLERY_BOOT_STYLE).toContain(`html { background: ${DARK_BACKDROP}`);
		expect(GALLERY_BOOT_STYLE).toContain(
			`html.loom-theme-light { background: ${LIGHT_BACKDROP}`,
		);
		// The stage colour and the UA form/scrollbar palette move together.
		expect(GALLERY_BOOT_STYLE).toContain("color-scheme: dark");
		expect(GALLERY_BOOT_STYLE).toContain("color-scheme: light");
	});
});

describe("gallery boot script", () => {
	it("applies the theme class before anything else runs", () => {
		expect(boot("?theme=light").themeLight).toBe(true);
		expect(boot("?theme=dark").themeLight).toBe(false);
		expect(boot("").themeLight).toBe(false);
	});

	it("paints a requested colour, leaving the themed default when there is none", () => {
		expect(boot("?background=white").background).toBe("white");
		expect(boot("?theme=light&background=%23ffffff").background).toBe(
			"#ffffff",
		);
		expect(boot("?background=f6f9fc").background).toBe("#f6f9fc");
		// Nothing inline: the boot style's own `html` rule is the backdrop.
		expect(boot("?theme=light").background).toBe("");
	});

	it("reads ?background= exactly as the shell does", () => {
		const cases = [
			"white",
			"transparent",
			"#ffffff",
			"#f0fa",
			"fff",
			"F6F9FC",
			"rgb(255, 255, 255)",
			"  white  ",
			"",
			"auto",
			"url(https://evil.test/x.png)",
			"white; background-image: url(https://evil.test/x)",
			"rgb(var(--x))",
			"linear-gradient(red, blue)",
			"}html{display:none",
		];
		for (const value of cases) {
			const shell = parseBackgroundColor(value);
			// A colour the CSSOM refuses (`auto`) is dropped by both — the shell at
			// assignment, the snippet the same way — so compare what actually sticks.
			const probe = document.createElement("div");
			if (shell !== undefined) probe.style.background = shell;
			expect(
				boot(`?background=${encodeURIComponent(value)}`).background,
				`?background=${value}`,
			).toBe(probe.style.background);
		}
	});

	it("survives a hostile or absent search string without throwing", () => {
		expect(() => boot("?background=%E2%9A%A0&theme=%00")).not.toThrow();
		expect(boot("?background=%E2%9A%A0").background).toBe("");
	});
});
