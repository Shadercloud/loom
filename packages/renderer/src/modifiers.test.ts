/**
 * Visual modifier children -> CSS. `UIStroke` and `UIShadow` both land on
 * `box-shadow`, so they are asserted together: the interesting failure is not
 * either mapping alone but one silently overwriting the other.
 */
import type { LayoutResult, Rect, SceneNode } from "@loom-dev/scene";
import { color3FromRGB, prop, udim, udim2 } from "@loom-dev/scene";
import { describe, expect, it } from "vitest";
import { renderScene } from "./index";

/**
 * One flat advance per character, so a wrapped label breaks at widths this file
 * can state exactly. Only `measureText` is stubbed: the face metrics stay
 * absent, which is what jsdom offers anyway, so nothing else here moves.
 */
const CHAR_W = 6;
Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
	configurable: true,
	writable: true,
	value: () => ({
		font: "",
		measureText: (text: string) => ({ width: text.length * CHAR_W }),
	}),
});

function layoutOf(entries: Record<string, Rect>): LayoutResult {
	const rects: LayoutResult["rects"] = {};
	for (const [id, rect] of Object.entries(entries)) rects[id] = { rect };
	return { rects };
}

/**
 * The card is a *child* of the root: scene roots are transparent containers and
 * never take background or modifier styling.
 */
function sceneWith(modifiers: SceneNode[]): SceneNode {
	return {
		className: "Frame",
		name: "Root",
		id: "root",
		children: [
			{
				className: "Frame",
				name: "Card",
				id: "card",
				properties: { BackgroundColor3: prop.color3(color3FromRGB(255, 0, 0)) },
				children: modifiers,
			},
		],
	};
}

const LAYOUT_WITH_ICON = layoutOf({
	root: { x: 0, y: 0, width: 400, height: 300 },
	icon: { x: 0, y: 0, width: 24, height: 24 },
});

const LAYOUT = layoutOf({
	root: { x: 0, y: 0, width: 400, height: 300 },
	card: { x: 0, y: 0, width: 200, height: 100 },
});

function cardStyle(modifiers: SceneNode[]): CSSStyleDeclaration {
	const mount = document.createElement("div");
	renderScene(sceneWith(modifiers), LAYOUT, mount);
	const card = mount.querySelector<HTMLElement>('[data-loom-name="Card"]');
	if (!card) throw new Error("card not rendered");
	return card.style;
}

const shadow = (properties: SceneNode["properties"]): SceneNode => ({
	className: "UIShadow",
	name: "UIShadow",
	properties,
});

describe("UIShadow", () => {
	it("becomes an outset box-shadow", () => {
		const style = cardStyle([
			shadow({
				Offset: prop.udim2(udim2(0, 2, 0, 4)),
				BlurRadius: prop.udim(udim(0, 6)),
				Spread: prop.udim2(udim2(0, 1, 0, 1)),
				Color: prop.color3(color3FromRGB(0, 0, 0)),
				Transparency: prop.number(0.5),
			}),
		]);
		expect(style.boxShadow).toBe("2px 4px 6px 1px rgba(0, 0, 0, 0.5)");
	});

	it("resolves scale against the parent rect, per axis", () => {
		// Offset x against width (200), y against height (100); blur against the
		// shorter side (100). Spread is one CSS length, so the two axes average.
		const style = cardStyle([
			shadow({
				Offset: prop.udim2(udim2(0.1, 0, 0.1, 0)),
				BlurRadius: prop.udim(udim(0.1, 0)),
				Spread: prop.udim2(udim2(0.1, 0, 0, 0)),
			}),
		]);
		expect(style.boxShadow).toBe("20px 10px 10px 10px rgba(0, 0, 0, 1)");
	});

	it("is omitted when disabled or fully transparent", () => {
		expect(cardStyle([shadow({ Enabled: prop.bool(false) })]).boxShadow).toBe(
			"",
		);
		expect(
			cardStyle([shadow({ Transparency: prop.number(1) })]).boxShadow,
		).toBe("");
	});

	it("layers under a UIStroke ring instead of replacing it", () => {
		const style = cardStyle([
			{
				className: "UIStroke",
				name: "UIStroke",
				properties: {
					Color: prop.color3(color3FromRGB(0, 0, 255)),
					Thickness: prop.number(2),
				},
			},
			shadow({ BlurRadius: prop.udim(udim(0, 4)) }),
		]);
		// Ring first: CSS paints earlier shadows on top, and the ring hugs the
		// border box the drop shadow spreads out behind.
		expect(style.boxShadow).toBe(
			"0 0 0 2px rgba(0, 0, 255, 1), 0px 0px 4px 0px rgba(0, 0, 0, 1)",
		);
	});
});

describe("LineHeight", () => {
	function textLayer(properties: SceneNode["properties"]): HTMLElement {
		const mount = document.createElement("div");
		renderScene(
			{
				className: "Frame",
				name: "Root",
				id: "root",
				children: [
					{
						className: "TextLabel",
						name: "Label",
						id: "card",
						properties: {
							Text: prop.string("one\ntwo"),
							TextSize: prop.number(20),
							...properties,
						},
					},
				],
			},
			LAYOUT,
			mount,
		);
		const label = mount.querySelector<HTMLElement>('[data-loom-name="Label"]');
		const layer = label?.querySelector<HTMLElement>("div");
		if (!layer) throw new Error("text layer not rendered");
		return layer;
	}

	it("is single-spaced by default", () => {
		// In pixels off `TextSize`, not as a multiple of the font size: the font
		// size is `TextSize` scaled down by the face's own metrics (see
		// `cssFontSize`), and the engine's line pitch does not follow it.
		const layer = textLayer({});
		expect(layer.style.lineHeight).toBe("20px");
		expect(layer.querySelector<HTMLElement>("div")?.style.marginTop).toBe("");
	});

	it("spends the extra room between lines, not around the block", () => {
		// CSS gives every line box the full line-height, half of it above the text
		// and half below; Roblox only stretches the gaps. Cropping the leading off
		// both outer edges (20 * 0.5 / 2 = 5px) leaves the block the height the
		// engine measures — and a one-line label exactly `TextSize` tall.
		const layer = textLayer({ LineHeight: prop.number(1.5) });
		expect(layer.style.lineHeight).toBe("30px");
		const inner = layer.querySelector<HTMLElement>("div");
		expect(inner?.style.marginTop).toBe("-5px");
		expect(inner?.style.marginBottom).toBe("-5px");
	});

	it("clamps to the 1…3 Studio allows", () => {
		expect(textLayer({ LineHeight: prop.number(0.2) }).style.lineHeight).toBe(
			"20px",
		);
		expect(textLayer({ LineHeight: prop.number(9) }).style.lineHeight).toBe(
			"60px",
		);
	});
});

describe("UICorner", () => {
	const corner = (properties: SceneNode["properties"]): SceneNode => ({
		className: "UICorner",
		name: "UICorner",
		properties,
	});

	it("rounds every corner from CornerRadius, scale against the shorter side", () => {
		// The card is 200x100, so a 0.1 scale is 10px — not 20.
		expect(
			cardStyle([corner({ CornerRadius: prop.udim(udim(0.1, 2)) })])
				.borderRadius,
		).toBe("12px");
	});

	it("takes each corner's own radius over CornerRadius", () => {
		// How a card rounds only its top while its footer rounds only its bottom:
		// the two sides that are set win, the two that are not fall back.
		const style = cardStyle([
			corner({
				CornerRadius: prop.udim(udim(0, 4)),
				TopLeftRadius: prop.udim(udim(0, 8)),
				TopRightRadius: prop.udim(udim(0, 8)),
			}),
		]);
		expect(style.borderRadius).toBe("8px 8px 4px 4px");
	});

	it("squares the box off again when every corner is zero", () => {
		expect(
			cardStyle([corner({ CornerRadius: prop.udim(udim(0, 0)) })]).borderRadius,
		).toBe("");
	});
});

describe("UIStroke", () => {
	const stroke = (properties: SceneNode["properties"]): SceneNode => ({
		className: "UIStroke",
		name: "UIStroke",
		properties: {
			Color: prop.color3(color3FromRGB(0, 0, 255)),
			Thickness: prop.number(2),
			...properties,
		},
	});
	const position = (name: string): SceneNode["properties"] => ({
		BorderStrokePosition: prop.enum({
			enumType: "BorderStrokePosition",
			name,
			value: 0,
		}),
	});

	it("spreads outward by default", () => {
		expect(cardStyle([stroke({})]).boxShadow).toBe(
			"0 0 0 2px rgba(0, 0, 255, 1)",
		);
	});

	it("insets an Inner stroke so it eats into the object", () => {
		// A bordered header inside a card has to stay flush with it rather than
		// overhang it by the thickness.
		expect(cardStyle([stroke(position("Inner"))]).boxShadow).toBe(
			"inset 0 0 0 2px rgba(0, 0, 255, 1)",
		);
	});

	it("straddles the edge with half the thickness each way for Center", () => {
		expect(cardStyle([stroke(position("Center"))]).boxShadow).toBe(
			"0 0 0 1px rgba(0, 0, 255, 1), inset 0 0 0 1px rgba(0, 0, 255, 1)",
		);
	});

	it("is omitted when disabled or fully transparent", () => {
		expect(cardStyle([stroke({ Enabled: prop.bool(false) })]).boxShadow).toBe(
			"",
		);
		expect(
			cardStyle([stroke({ Transparency: prop.number(1) })]).boxShadow,
		).toBe("");
	});
});

describe("ImageColor3", () => {
	function imageStyle(properties: SceneNode["properties"]): {
		filter: string;
		el: HTMLElement;
	} {
		const mount = document.createElement("div");
		renderScene(
			{
				className: "Frame",
				name: "Root",
				id: "root",
				children: [
					{
						className: "ImageLabel",
						name: "Icon",
						id: "icon",
						properties: {
							Image: prop.string("https://example.test/icon.png"),
							...properties,
						},
					},
				],
			},
			LAYOUT_WITH_ICON,
			mount,
		);
		const el = mount.querySelector<HTMLElement>('[data-loom-layer="image"]');
		if (!el) throw new Error("image layer not rendered");
		return { filter: el.style.filter, el };
	}

	it("multiplies the image through an feColorMatrix", () => {
		// Roblox multiplies per channel and leaves alpha alone, which is exactly
		// what this matrix says — so the mapping is the operation, not a likeness.
		const { filter } = imageStyle({
			ImageColor3: prop.color3(color3FromRGB(255, 0, 0)),
		});
		expect(filter).toBe("url(#loom-tint-ff0000)");

		const node = document.getElementById("loom-tint-ff0000");
		expect(node).not.toBeNull();
		expect(node?.getAttribute("color-interpolation-filters")).toBe("sRGB");
		const matrix = node?.firstElementChild;
		expect(matrix?.getAttribute("values")).toBe(
			"1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0",
		);
	});

	it("leaves an untinted image unfiltered", () => {
		// White is the Roblox default and multiplies to the identity: no filter,
		// so the overwhelmingly common case costs nothing.
		expect(imageStyle({}).filter).toBe("");
		expect(
			imageStyle({ ImageColor3: prop.color3(color3FromRGB(255, 255, 255)) })
				.filter,
		).toBe("");
	});

	it("mints one filter per colour, not per element", () => {
		const first = imageStyle({
			ImageColor3: prop.color3(color3FromRGB(0, 128, 255)),
		});
		const second = imageStyle({
			ImageColor3: prop.color3(color3FromRGB(0, 128, 255)),
		});
		expect(first.filter).toBe(second.filter);
		expect(document.querySelectorAll("#loom-tint-0080ff")).toHaveLength(1);
	});
});

describe("RichText", () => {
	function textLayer(properties: SceneNode["properties"]): HTMLElement {
		const mount = document.createElement("div");
		renderScene(
			{
				className: "Frame",
				name: "Root",
				id: "root",
				children: [
					{
						className: "TextLabel",
						name: "Label",
						id: "icon",
						properties,
					},
				],
			},
			LAYOUT_WITH_ICON,
			mount,
		);
		const label = mount.querySelector<HTMLElement>('[data-loom-name="Label"]');
		const inner = label?.querySelector<HTMLElement>("div > div");
		if (!inner) throw new Error("text layer not rendered");
		return inner;
	}

	it("keeps the markup literal while RichText is off", () => {
		// The Roblox default, and the reason this cannot simply always parse.
		const inner = textLayer({ Text: prop.string("<b>xl</b> Scale") });
		expect(inner.textContent).toBe("<b>xl</b> Scale");
		expect(inner.querySelector("span")).toBeNull();
	});

	it("paints one span per styled run", () => {
		const inner = textLayer({
			Text: prop.string('<b>xl</b> Scale <font color="#FF0000">and red</font>'),
			RichText: prop.bool(true),
		});
		expect(inner.textContent).toBe("xl Scale and red");
		const spans = [...inner.querySelectorAll("span")];
		expect(spans.map((s) => s.textContent)).toEqual([
			"xl",
			" Scale ",
			"and red",
		]);
		expect(spans[0]?.style.fontWeight).toBe("bold");
		// Set verbatim; a real browser normalizes it to rgb(), happy-dom does not.
		expect(spans[2]?.style.color).toBe("#FF0000");
	});

	it("emits a <br> for a line break", () => {
		const inner = textLayer({
			Text: prop.string("one<br/>two"),
			RichText: prop.bool(true),
		});
		expect(inner.querySelectorAll("br")).toHaveLength(1);
	});

	it("never turns markup into elements it did not describe", () => {
		// Scene text is app data. Parsed through `createTextNode`, an `<img>` in
		// the string is text; through `innerHTML` it would be a request.
		const inner = textLayer({
			Text: prop.string('<img src=x onerror="boom">'),
			RichText: prop.bool(true),
		});
		expect(inner.querySelector("img")).toBeNull();
		expect(inner.textContent).toBe('<img src=x onerror="boom">');
	});

	it("carries the label's colour into a run that only sets transparency", () => {
		const inner = textLayer({
			Text: prop.string('<font transparency="0.5">x</font>'),
			RichText: prop.bool(true),
			TextColor3: prop.color3(color3FromRGB(0, 0, 255)),
		});
		expect(inner.querySelector("span")?.style.color).toBe(
			"rgba(0, 0, 255, 0.5)",
		);
	});
});

describe("TextWrap", () => {
	/**
	 * The label is 24 wide (`LAYOUT_WITH_ICON`), so at {@link CHAR_W} a four-letter
	 * word fills a line exactly and the next word has to start a new one.
	 */
	const FOUR_WORDS = "aaaa bbbb cccc";

	function paintedOf(properties: SceneNode["properties"]): {
		whiteSpace: string;
		text: string;
	} {
		const mount = document.createElement("div");
		renderScene(
			{
				className: "Frame",
				name: "Root",
				id: "root",
				children: [
					{ className: "TextLabel", name: "Label", id: "icon", properties },
				],
			},
			LAYOUT_WITH_ICON,
			mount,
		);
		const inner = mount.querySelector<HTMLElement>(
			'[data-loom-name="Label"] div > div',
		);
		if (!inner) throw new Error("text layer not rendered");
		return {
			whiteSpace: inner.style.whiteSpace,
			text: inner.textContent ?? "",
		};
	}

	/** The lines the label actually paints, however it was told to break them. */
	function linesOf(properties: SceneNode["properties"]): string[] {
		return paintedOf(properties).text.split("\n");
	}

	it("honours the deprecated TextWrap alias", () => {
		// Roblox's own docs call `TextWrap` "simply an alias for `TextWrapped`", so
		// a tree that sets only the old spelling wraps in the engine. Reading the
		// new spelling alone ran the text off the edge of its container.
		expect(
			linesOf({ Text: prop.string(FOUR_WORDS), TextWrap: prop.bool(true) }),
		).toEqual(["aaaa", "bbbb", "cccc"]);
		expect(
			linesOf({ Text: prop.string(FOUR_WORDS), TextWrap: prop.bool(false) }),
		).toEqual([FOUR_WORDS]);
	});

	it("lets the modern spelling win when both are set", () => {
		expect(
			linesOf({
				Text: prop.string(FOUR_WORDS),
				TextWrapped: prop.bool(false),
				TextWrap: prop.bool(true),
			}),
		).toEqual([FOUR_WORDS]);
	});

	it("defaults to not wrapping", () => {
		expect(linesOf({ Text: prop.string(FOUR_WORDS) })).toEqual([FOUR_WORDS]);
	});

	it("breaks where the measurement broke, not where the browser would", () => {
		// CSS wraps on the browser's own kerned run widths, which are narrower than
		// the advances the box was measured with — so a label could reserve a line
		// the paint never filled. A wrapped label now carries the measurement's own
		// breaks, and `pre` keeps them exactly.
		const painted = paintedOf({
			Text: prop.string(FOUR_WORDS),
			TextWrapped: prop.bool(true),
		});
		expect(painted.whiteSpace).toBe("pre");
		expect(painted.text).toBe("aaaa\nbbbb\ncccc");
	});

	it("keeps the whitespace the engine keeps", () => {
		// The engine renders the string literally: a newline breaks the line
		// whether or not the label wraps, and spaces are never folded together.
		// HTML collapses both by default, which left text that *measured* as
		// several lines painting as one — a box built for a line count that was
		// never drawn.
		expect(
			linesOf({ Text: prop.string("a\nb"), TextWrapped: prop.bool(true) }),
		).toEqual(["a", "b"]);
		expect(
			paintedOf({ Text: prop.string("a\nb"), TextWrapped: prop.bool(false) }),
		).toEqual({ whiteSpace: "pre", text: "a\nb" });
	});
});
