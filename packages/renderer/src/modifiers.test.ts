/**
 * Visual modifier children -> CSS. `UIStroke` and `UIShadow` both land on
 * `box-shadow`, so they are asserted together: the interesting failure is not
 * either mapping alone but one silently overwriting the other.
 */
import type { LayoutResult, Rect, SceneNode } from "@loom-dev/scene";
import { color3FromRGB, prop, udim, udim2 } from "@loom-dev/scene";
import { describe, expect, it } from "vitest";
import { renderScene } from "./index";

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

describe("ImageColor3", () => {
	function imageStyle(properties: SceneNode["properties"]): {
		filter: string;
		el: HTMLImageElement;
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
		const el = mount.querySelector("img");
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
	function wrapOf(properties: SceneNode["properties"]): string {
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
		return inner.style.whiteSpace;
	}

	it("honours the deprecated TextWrap alias", () => {
		// Roblox's own docs call `TextWrap` "simply an alias for `TextWrapped`", so
		// a tree that sets only the old spelling wraps in the engine. Reading the
		// new spelling alone ran the text off the edge of its container.
		expect(wrapOf({ Text: prop.string("x"), TextWrap: prop.bool(true) })).toBe(
			"normal",
		);
		expect(wrapOf({ Text: prop.string("x"), TextWrap: prop.bool(false) })).toBe(
			"nowrap",
		);
	});

	it("lets the modern spelling win when both are set", () => {
		expect(
			wrapOf({
				Text: prop.string("x"),
				TextWrapped: prop.bool(false),
				TextWrap: prop.bool(true),
			}),
		).toBe("nowrap");
	});

	it("defaults to nowrap", () => {
		expect(wrapOf({ Text: prop.string("x") })).toBe("nowrap");
	});
});
