/**
 * The font registry: which Roblox family a name belongs to, what CSS stack it
 * paints with registered and unregistered, the `@font-face` rules a
 * registration declares, and the change notification the adapters re-measure
 * on.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	clearRegisteredFonts,
	familyKey,
	onFontsChanged,
	registerFont,
} from "./fonts.ts";
import { fontFamily, measureText } from "./index.ts";

afterEach(() => {
	clearRegisteredFonts();
});

/** The rules loom's own `<style>` element currently declares. */
function injectedCss(): string {
	return (
		document.querySelector<HTMLStyleElement>("style[data-loom-fonts]")
			?.textContent ?? ""
	);
}

describe("familyKey", () => {
	it("folds every spelling of a family onto one key", () => {
		// The legacy enum folds the weight in; `FontFace` carries the asset's own
		// family name. Both have to reach the same registration.
		expect(familyKey("Gotham")).toBe("Gotham");
		expect(familyKey("GothamBold")).toBe("Gotham");
		expect(familyKey("GothamSSm")).toBe("Gotham");
		expect(familyKey("SourceSans")).toBe("SourceSans");
		expect(familyKey("SourceSansPro")).toBe("SourceSans");
		expect(familyKey("SourceSansSemibold")).toBe("SourceSans");
	});

	it("does not read RobotoMono as Roboto", () => {
		// Longest prefix first, or the monospace family paints proportional.
		expect(familyKey("RobotoMono")).toBe("RobotoMono");
		expect(familyKey("Roboto")).toBe("Roboto");
	});

	it("lets no family shadow another it is a prefix of", () => {
		// The table is matched by prefix, so a shorter name sitting in front of a
		// longer one would quietly swallow it — `Roboto` taking `RobotoCondensed`
		// paints a condensed face proportional and measures every line short.
		// These are every pair in the table where one name starts with another.
		expect(familyKey("RobotoCondensed")).toBe("RobotoCondensed");
		expect(familyKey("SourceSansPro")).toBe("SourceSans");
		expect(familyKey("SourceSansSemibold")).toBe("SourceSans");
		expect(familyKey("GothamSSm")).toBe("Gotham");
		expect(familyKey("LegacyArial")).toBe("Legacy");
		expect(familyKey("ArialBold")).toBe("Arial");
		expect(familyKey("FredokaOne")).toBe("FredokaOne");
		expect(familyKey("Fredoka")).toBe("FredokaOne");
		expect(familyKey("HighwayGothic")).toBe("Highway");
		expect(familyKey("BuilderSansMedium")).toBe("BuilderSans");
	});

	it("knows every family the engine can name", () => {
		// `Antique` and friends have no face to ship, but they are still the
		// engine's, and a name loom does not know falls to the generic stack with
		// no warning — which is the silence this table exists to end.
		expect(familyKey("Antique")).toBe("Antique");
		expect(familyKey("Jura")).toBe("Jura");
		expect(familyKey("BuilderSansExtraBold")).toBe("BuilderSans");
		expect(familyKey("ArimoBold")).toBe("Arimo");
		expect(familyKey("Code")).toBe("Inconsolata");
	});

	it("is undefined for a name it does not know", () => {
		expect(familyKey("Wingdings")).toBeUndefined();
		expect(familyKey(undefined)).toBeUndefined();
	});
});

describe("fontFamily", () => {
	it("names the Roblox font first, then falls back", () => {
		// The name still leads: on a machine that has the real font installed it
		// is the right answer, and it costs nothing where it is missing.
		expect(fontFamily("GothamBold")).toMatch(/^"Gotham", /);
		expect(fontFamily("GothamBold")).toContain("system-ui");
	});

	it("puts a registered family in front of the fallback", () => {
		registerFont("Gotham", { family: "Builder Sans" });
		expect(fontFamily("GothamBold")).toBe(
			`"Builder Sans", ${'"Gotham", system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'}`,
		);
		// Registered under one spelling, matched by any of them.
		expect(fontFamily("GothamSSm")).toContain('"Builder Sans"');
	});

	it("takes an explicit fallback over the family's default", () => {
		registerFont("SourceSans", {
			family: "Source Sans 3 Variable",
			fallback: "serif",
		});
		expect(fontFamily("SourceSansBold")).toBe(
			'"Source Sans 3 Variable", serif',
		);
	});

	it("leaves a family it does not know on the generic stack", () => {
		// Nothing Roblox-specific to lead with, so it starts at the system font.
		expect(fontFamily("Wingdings")).toBe(fontFamily(undefined));
		expect(fontFamily("Wingdings")).toMatch(/^system-ui, /);
		expect(fontFamily(undefined)).toContain("sans-serif");
	});

	it("leads with the engine's font for a family it ships no face for", () => {
		expect(fontFamily("Antique")).toMatch(/^"Sawarabi Mincho", /);
		expect(fontFamily("Arcade")).toMatch(/^"Press Start 2P", /);
	});
});

describe("registerFont", () => {
	it("declares the faces it is given, once each", () => {
		registerFont("SourceSans", {
			family: "Source Sans 3 Variable",
			faces: [
				{ src: "/fonts/ss3.woff2", weight: "200 900" },
				{ src: "/fonts/ss3-italic.woff2", weight: "200 900", style: "italic" },
			],
		});
		const css = injectedCss();
		expect(css).toContain('font-family:"Source Sans 3 Variable"');
		expect(css).toContain('src:url("/fonts/ss3.woff2")');
		expect(css).toContain("font-weight:200 900");
		expect(css).toContain("font-style:italic");
		// `swap` by default: paint in the fallback rather than not at all.
		expect(css).toContain("font-display:swap");

		// Re-registering the same face must not stack duplicate rules.
		const before = injectedCss().length;
		registerFont("SourceSans", {
			family: "Source Sans 3 Variable",
			faces: [{ src: "/fonts/ss3.woff2", weight: "200 900" }],
		});
		expect(injectedCss().length).toBe(before);
	});

	it("declares nothing when the page already provides the family", () => {
		registerFont("Gotham", { family: "Gotham" });
		expect(document.querySelector("style[data-loom-fonts]")).toBeNull();
	});

	it("notifies listeners so measured text is measured again", async () => {
		// Every AutomaticSize bound was measured against the faces available at
		// the time, so a face arriving later invalidates the layout it produced.
		const seen = vi.fn();
		const stop = onFontsChanged(seen);
		registerFont("Gotham", { family: "Builder Sans" });
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(seen).toHaveBeenCalled();

		seen.mockClear();
		stop();
		registerFont("Roboto", { family: "Roboto Variable" });
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(seen).not.toHaveBeenCalled();
	});
});

describe("clearRegisteredFonts", () => {
	it("takes the registrations and the rules back out", () => {
		registerFont("Gotham", {
			family: "Builder Sans",
			faces: [{ src: "/fonts/builder.woff2" }],
		});
		expect(document.querySelector("style[data-loom-fonts]")).not.toBeNull();

		clearRegisteredFonts();
		expect(document.querySelector("style[data-loom-fonts]")).toBeNull();
		expect(fontFamily("GothamBold")).not.toContain("Builder Sans");
	});
});

describe("measureText", () => {
	it("returns nothing for an empty string, and one line otherwise", () => {
		expect(measureText({ text: "", size: 18 })).toEqual({ x: 0, y: 0 });
		expect(measureText({ text: "hello", size: 18 }).y).toBe(18);
	});

	it("counts a line per newline, wrap or not", () => {
		expect(measureText({ text: "a\nb\nc", size: 10 }).y).toBe(30);
	});

	it("wraps at word boundaries when a width is given", () => {
		// happy-dom's canvas has no text metrics, so widths measure 0 and nothing
		// can overflow: the shape under test here is that a 0 width means "no
		// frame" (one line) rather than "wrap at zero" (a line per word).
		expect(measureText({ text: "one two three", size: 12, width: 0 }).y).toBe(
			12,
		);
	});
});
