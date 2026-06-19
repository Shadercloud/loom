/**
 * `@loom-dev/renderer` — framework-agnostic DOM mapping.
 *
 * Walks a {@link SceneNode} tree alongside a {@link LayoutResult} and produces
 * nested, absolutely-positioned `<div>`s. It reproduces the layout engine's id
 * scheme exactly: positional path (`"0"`, `"0/0"`, …) counting only
 * layout-participating children, overridden by `node.id` when present.
 *
 * Roblox fidelity rules honored here:
 * - The layout root and any LayerCollector (ScreenGui/SurfaceGui/BillboardGui)
 *   are transparent containers — never background-painted.
 * - Children are positioned relative to their parent's rect.
 * - `Visible:false` hides via CSS (the node still occupies its computed rect).
 * - Text classes paint their `Text` in an aligned overlay layer; `UICorner` and
 *   `UIStroke` modifier children become border-radius / box-shadow.
 */

import type { Color3, LayoutResult, Rect, SceneNode } from "@loom-dev/scene";
import {
	asBool,
	asColor3,
	asColorSequence,
	asNumber,
	asUDim,
	childrenOf,
	findModifier,
	getBackgroundColor3,
	getBackgroundTransparency,
	getClipsDescendants,
	getFontName,
	getText,
	getTextColor3,
	getTextSize,
	getTextTransparency,
	getTextWrapped,
	getTextXAlignment,
	getTextYAlignment,
	getVisible,
	getZIndex,
	isLayerCollector,
	participatesInLayout,
} from "@loom-dev/scene";

const ZERO_RECT: Rect = { x: 0, y: 0, width: 0, height: 0 };
const TEXT_CLASSES = new Set(["TextLabel", "TextButton", "TextBox"]);
const SANS =
	'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const MONO = 'ui-monospace, "Roboto Mono", "SF Mono", Menlo, monospace';

function cssColor(c: Color3, transparency: number): string {
	const r = Math.round(c.r * 255);
	const g = Math.round(c.g * 255);
	const b = Math.round(c.b * 255);
	return `rgba(${r}, ${g}, ${b}, ${1 - transparency})`;
}

// --- font / alignment mapping ------------------------------------------------

/** Roblox Font name -> CSS font-family stack. Exported so the adapter can measure
 *  text with the exact font the renderer will paint (AutomaticSize text bounds). */
export function fontFamily(name: string | undefined): string {
	if (!name) return SANS;
	if (name === "Code" || name === "RobotoMono") return MONO;
	if (name.startsWith("Gotham")) return `"Gotham", ${SANS}`;
	if (name.startsWith("SourceSans")) return `"Source Sans Pro", ${SANS}`;
	if (name.startsWith("Roboto")) return `"Roboto", ${SANS}`;
	if (name.startsWith("Arial")) return `Arial, ${SANS}`;
	return SANS;
}
/** Roblox Font name -> CSS font-weight. */
export function fontWeight(name: string | undefined): string {
	if (!name) return "400";
	if (name.includes("Black")) return "900";
	if (name.includes("Bold")) return "700";
	if (name.includes("Semibold")) return "600";
	if (name.includes("Medium")) return "500";
	if (name.includes("Light")) return "300";
	return "400";
}
const yAlignFlex = (a: string): string =>
	a === "Top" ? "flex-start" : a === "Bottom" ? "flex-end" : "center";
const xAlignText = (a: string): string =>
	a === "Left" ? "left" : a === "Right" ? "right" : "center";

// --- visual modifiers --------------------------------------------------------

/** `UICorner` -> border-radius (CornerRadius scale is relative to the shorter side). */
function applyCorner(
	s: CSSStyleDeclaration,
	node: SceneNode,
	rect: Rect,
): void {
	const corner = findModifier(node, "UICorner");
	if (!corner) return;
	const cr = asUDim(corner.properties?.CornerRadius) ?? { scale: 0, offset: 0 };
	const radius = cr.scale * Math.min(rect.width, rect.height) + cr.offset;
	if (radius > 0) s.borderRadius = `${radius}px`;
}

/** `UIStroke` -> an outset box-shadow ring (follows the corner radius). */
function applyStroke(s: CSSStyleDeclaration, node: SceneNode): void {
	const stroke = findModifier(node, "UIStroke");
	if (!stroke) return;
	const color = asColor3(stroke.properties?.Color) ?? { r: 0, g: 0, b: 0 };
	const thickness = asNumber(stroke.properties?.Thickness) ?? 1;
	const transparency = asNumber(stroke.properties?.Transparency) ?? 0;
	if (thickness > 0) {
		s.boxShadow = `0 0 0 ${thickness}px ${cssColor(color, transparency)}`;
	}
}

/**
 * `UIGradient` -> a CSS `linear-gradient` over the background. Roblox Rotation 0
 * is left->right (CSS 90deg). Transparency (a NumberSequence) is deferred; the
 * gradient overlays rather than multiplies the BackgroundColor3 (approximation).
 */
function applyGradient(s: CSSStyleDeclaration, node: SceneNode): void {
	const grad = findModifier(node, "UIGradient");
	if (!grad) return;
	if (asBool(grad.properties?.Enabled) === false) return;
	const seq = asColorSequence(grad.properties?.Color);
	if (!seq || seq.keypoints.length === 0) return;
	const rotation = asNumber(grad.properties?.Rotation) ?? 0;
	const stops = seq.keypoints
		.map((k) => `${cssColor(k.color, 0)} ${(k.time * 100).toFixed(3)}%`)
		.join(", ");
	s.backgroundImage = `linear-gradient(${90 + rotation}deg, ${stops})`;
}

/** Paint a text class's `Text` in an aligned overlay layer at the node's ZIndex. */
function applyText(el: HTMLDivElement, node: SceneNode): void {
	if (!TEXT_CLASSES.has(node.className)) return;
	const text = getText(node);
	if (text === undefined || text === "") return;

	// Outer layer handles vertical alignment; the inner full-width element lets
	// `text-align` align every (wrapped) line over the whole label width.
	const layer = document.createElement("div");
	const s = layer.style;
	const fontName = getFontName(node);
	s.position = "absolute";
	s.inset = "0";
	s.display = "flex";
	s.flexDirection = "column";
	s.justifyContent = yAlignFlex(getTextYAlignment(node));
	s.color = cssColor(getTextColor3(node), getTextTransparency(node));
	s.fontSize = `${getTextSize(node)}px`;
	s.fontFamily = fontFamily(fontName);
	s.fontWeight = fontWeight(fontName);
	if (fontName?.includes("Italic")) s.fontStyle = "italic";
	s.lineHeight = "1"; // Roblox default LineHeight is 1.0
	s.overflow = "hidden";
	s.pointerEvents = "none";
	s.zIndex = String(getZIndex(node)); // share the unified ZIndex space with children

	const inner = document.createElement("div");
	inner.style.width = "100%";
	inner.style.textAlign = xAlignText(getTextXAlignment(node));
	inner.style.whiteSpace = getTextWrapped(node) ? "normal" : "nowrap";
	inner.textContent = text;
	layer.appendChild(inner);
	el.appendChild(layer);
}

// --- tree walk ---------------------------------------------------------------

function renderNode(
	node: SceneNode,
	positionalPath: string,
	isRoot: boolean,
	layout: LayoutResult,
	parentRect: Rect,
): HTMLDivElement | undefined {
	const resolvedId = node.id ?? positionalPath;
	const entry = layout.rects[resolvedId];
	if (!entry) return undefined; // not laid out (shouldn't happen for layout nodes)
	const rect = entry.rect;

	const el = document.createElement("div");
	el.dataset.loomClass = node.className;
	el.dataset.loomName = node.name;
	const s = el.style;
	s.position = "absolute";
	s.left = `${rect.x - parentRect.x}px`;
	s.top = `${rect.y - parentRect.y}px`;
	s.width = `${rect.width}px`;
	s.height = `${rect.height}px`;
	s.zIndex = String(getZIndex(node));
	if (!getVisible(node)) s.display = "none";
	if (node.className === "ScrollingFrame" || getClipsDescendants(node)) {
		s.overflow = "hidden";
	}
	if (!isRoot && !isLayerCollector(node.className)) {
		s.background = cssColor(
			getBackgroundColor3(node),
			getBackgroundTransparency(node),
		);
		applyGradient(s, node);
		applyCorner(s, node, rect);
		applyStroke(s, node);
	}

	applyText(el, node);

	let i = 0;
	for (const child of childrenOf(node)) {
		if (!participatesInLayout(child.className)) continue; // skip modifiers
		const childEl = renderNode(
			child,
			`${positionalPath}/${i}`,
			false,
			layout,
			rect,
		);
		if (childEl) el.appendChild(childEl);
		i += 1;
	}
	return el;
}

/** Render (replacing any prior content) a scene + its computed layout into `mount`. */
export function renderScene(
	root: SceneNode,
	layout: LayoutResult,
	mount: HTMLElement,
): void {
	mount.replaceChildren();
	const el = renderNode(root, "0", true, layout, ZERO_RECT);
	if (el) mount.appendChild(el);
}
