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
import { fontFamily } from "./index.ts";

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

	it("is undefined for a name it does not know", () => {
		expect(familyKey("Antique")).toBeUndefined();
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

	it("leaves an unknown family on the generic stack", () => {
		// Nothing Roblox-specific to lead with, so it starts at the system font.
		expect(fontFamily("Antique")).toBe(fontFamily(undefined));
		expect(fontFamily("Antique")).toMatch(/^system-ui, /);
		expect(fontFamily(undefined)).toContain("sans-serif");
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
