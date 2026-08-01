/**
 * The `RichText` parser. Two things are being pinned down: the styles the
 * engine's tags mean, and — just as much — what it leaves alone. A parser that
 * swallowed unknown tags would silently delete text a Roblox client shows.
 */
import { describe, expect, it } from "vitest";
import { decodeEntities, parseRichText, richTextToPlain } from "./richtext.ts";

/** `[text, styleKeysSet]` per run — the shape most assertions care about. */
function runs(source: string): Array<[string, string[]]> {
	return parseRichText(source).flatMap((segment) =>
		segment.kind === "break"
			? [["\n", []] as [string, string[]]]
			: [
					[segment.text, Object.keys(segment.style).sort()] as [
						string,
						string[],
					],
				],
	);
}

describe("parseRichText", () => {
	it("splits a flagged run out of the surrounding text", () => {
		expect(runs("<b>xl</b> Scale and Spacing")).toEqual([
			["xl", ["bold"]],
			[" Scale and Spacing", []],
		]);
	});

	it("accumulates nested styles rather than nesting runs", () => {
		// The output is flat, so the inner run has to carry both.
		const parsed = parseRichText("<b>bold <i>and italic</i></b>");
		expect(parsed).toEqual([
			{ kind: "text", text: "bold ", style: { bold: true } },
			{ kind: "text", text: "and italic", style: { bold: true, italic: true } },
		]);
	});

	it("pops only the style its closing tag opened", () => {
		expect(runs("<b>a<i>b</i>c</b>d")).toEqual([
			["a", ["bold"]],
			["b", ["bold", "italic"]],
			["c", ["bold"]],
			["d", []],
		]);
	});

	it("reads the font attributes", () => {
		const [run] = parseRichText(
			'<font color="#FF0000" size="24" weight="bold" face="GothamBold" transparency="0.5">x</font>',
		);
		expect(run).toEqual({
			kind: "text",
			text: "x",
			style: {
				color: "#FF0000",
				size: 24,
				weight: "700",
				face: "GothamBold",
				transparency: 0.5,
			},
		});
	});

	it("takes rgb() colours", () => {
		expect(
			parseRichText('<font color="rgb(1, 2,3)">x</font>')[0],
		).toMatchObject({ style: { color: "rgb(1, 2, 3)" } });
	});

	it("takes an unquoted attribute value that has no spaces in it", () => {
		// Roblox's own markup always quotes; this is leniency, and it stops where
		// the value would become ambiguous.
		expect(parseRichText("<font size=9>x</font>")[0]).toMatchObject({
			style: { size: 9 },
		});
	});

	it("drops an attribute it cannot read instead of the whole tag", () => {
		// A bad colour must not cost the text its `<font size>`.
		expect(parseRichText('<font color="tomato" size="9">x</font>')[0]).toEqual({
			kind: "text",
			text: "x",
			style: { size: 9 },
		});
	});

	it("turns <br/> into a break, in either spelling", () => {
		expect(runs("a<br/>b<br>c")).toEqual([
			["a", []],
			["\n", []],
			["b", []],
			["\n", []],
			["c", []],
		]);
	});

	it("decodes character entities", () => {
		expect(richTextToPlain("&lt;b&gt; &amp; &#65;&#x42;")).toBe("<b> & AB");
		expect(decodeEntities("&nosuch; &#zz;")).toBe("&nosuch; &#zz;");
	});

	it("keeps an unknown tag as literal text", () => {
		// Roblox shows it; deleting it would lose content the client renders.
		expect(runs("a<blink>b</blink>c")).toEqual([["a<blink>b</blink>c", []]]);
	});

	it("keeps `<stroke>` literal — it is a documented gap, not silent support", () => {
		expect(richTextToPlain('<stroke color="#000">x</stroke>')).toBe(
			'<stroke color="#000">x</stroke>',
		);
	});

	it("keeps an unterminated `<` as text", () => {
		expect(runs("a < b")).toEqual([["a < b", []]]);
		expect(runs("2 <b")).toEqual([["2 <b", []]]);
	});

	it("ignores a stray closing tag", () => {
		expect(runs("a</b>b")).toEqual([["ab", []]]);
	});

	it("returns nothing for an empty string", () => {
		expect(parseRichText("")).toEqual([]);
	});
});

describe("richTextToPlain", () => {
	it("is what the label actually shows", () => {
		expect(
			richTextToPlain('<b>Bold</b> and <font color="#f00">red</font>'),
		).toBe("Bold and red");
	});

	it("makes <br/> a newline, so measurement counts the line", () => {
		expect(richTextToPlain("one<br/>two")).toBe("one\ntwo");
	});
});
