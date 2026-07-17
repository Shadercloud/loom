/**
 * `@loom-dev/renderer` — framework-agnostic DOM mapping.
 *
 * Walks a {@link SceneNode} tree alongside a {@link LayoutResult} and produces
 * nested, absolutely-positioned `<div>`s. It reproduces the layout engine's id
 * scheme exactly: positional path (`"0"`, `"0/0"`, …) counting only
 * layout-participating children, overridden by `node.id` when present.
 *
 * Two entry points share the same per-node CSS mapping:
 * - {@link renderScene} — one-shot full rebuild (`replaceChildren`), used by the
 *   vide adapter and anything that only needs a static picture.
 * - {@link createDomSession} — keyed incremental patching plus pointer-input
 *   delegation, used by the react world. Elements persist across frames (so
 *   listeners/focus survive) and input events dispatch onto the live
 *   `LoomInstance` tree via `data-loom-id`.
 *
 * Roblox fidelity rules honored here:
 * - The layout root and any LayerCollector (ScreenGui/SurfaceGui/BillboardGui)
 *   are transparent containers — never background-painted.
 * - Children are positioned relative to their parent's rect.
 * - `Visible:false` hides via CSS (the node still occupies its computed rect).
 * - Text classes paint their `Text` in an aligned overlay layer; `UICorner` and
 *   `UIStroke` modifier children become border-radius / box-shadow.
 */

import type { EnumItem, InputObject, LoomInstance } from "@loom-dev/runtime";
import {
	Enum,
	getEventSignal,
	getService,
	makeInputObject,
	setMouseLocation,
	Vector2,
	Vector3,
} from "@loom-dev/runtime";
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

/**
 * The full per-node box style (position, size, z-order, visibility, clipping,
 * background + modifiers) — the single CSS mapping both `renderScene` and the
 * incremental session share, so the two paths stay pixel-identical.
 */
function applyBoxStyle(
	s: CSSStyleDeclaration,
	node: SceneNode,
	rect: Rect,
	parentRect: Rect,
	isRoot: boolean,
): void {
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
}

/** Build a text class's `Text` overlay layer, or `undefined` when empty. */
function createTextLayer(node: SceneNode): HTMLDivElement | undefined {
	if (!TEXT_CLASSES.has(node.className)) return undefined;
	const text = getText(node);
	if (text === undefined || text === "") return undefined;

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
	return layer;
}

/**
 * Fingerprint of every input `createTextLayer` reads, so the session rebuilds
 * the overlay only when a text-affecting prop actually changed.
 */
function textLayerKey(node: SceneNode): string {
	if (!TEXT_CLASSES.has(node.className)) return "";
	const text = getText(node);
	if (text === undefined || text === "") return "";
	return [
		text,
		getFontName(node) ?? "",
		getTextSize(node),
		cssColor(getTextColor3(node), getTextTransparency(node)),
		getTextWrapped(node) ? 1 : 0,
		getTextXAlignment(node),
		getTextYAlignment(node),
		getZIndex(node),
	].join(" ");
}

// --- one-shot tree walk (renderScene) ----------------------------------------

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
	applyBoxStyle(el.style, node, rect, parentRect, isRoot);

	const textLayer = createTextLayer(node);
	if (textLayer) el.appendChild(textLayer);

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

// --- incremental DOM session -------------------------------------------------

/** What `createDomSession` needs from its caller (the react world). */
export interface DomSessionOptions {
	/** Resolve a scene node id (`data-loom-id`) back to its live instance. */
	resolveInstance(id: string): LoomInstance | undefined;
}

/** A persistent, incrementally-patched DOM view of one scene tree. */
export interface DomSession {
	/** Reconcile the DOM against a new scene + layout (keyed by node id). */
	patch(root: SceneNode, layout: LayoutResult): void;
	/** Remove every element the session owns (the "no root" world state). */
	clear(): void;
	/** `clear()` plus input-listener teardown; the session is dead afterwards. */
	dispose(): void;
}

interface SessionEntry {
	el: HTMLDivElement;
	textEl: HTMLDivElement | undefined;
	styleKey: string;
	textKey: string;
}

/** Reorder `el`'s children to exactly `desired`, touching only mismatches. */
function syncChildren(el: HTMLElement, desired: readonly HTMLElement[]): void {
	let cursor = el.firstChild;
	for (const child of desired) {
		if (cursor === child) {
			cursor = cursor.nextSibling;
			continue;
		}
		el.insertBefore(child, cursor);
	}
	while (cursor) {
		const next = cursor.nextSibling;
		(cursor as ChildNode).remove();
		cursor = next;
	}
}

/**
 * Create a persistent DOM session on `mount`: keyed incremental patching (same
 * CSS mapping as {@link renderScene}, but elements survive across patches so
 * listeners and focus persist) plus delegated pointer input that dispatches
 * Roblox events (`InputBegan`/`InputEnded`/`Activated`/`MouseEnter`/…) onto the
 * live instance tree and the global `UserInputService` signals.
 *
 * Event argument shapes (the react adapter prepends the instance itself):
 * - `InputBegan`/`InputEnded`/`InputChanged` → `(inputObject)`
 * - `Activated` → `(inputObject, clickCount)`
 * - `MouseButton1Click` → `()` (GuiButton classes only)
 * - `MouseEnter`/`MouseLeave` → `(x, y)` in mount-relative pixels
 */
export function createDomSession(
	mount: HTMLElement,
	options: DomSessionOptions,
): DomSession {
	const entries = new Map<string, SessionEntry>();
	// Scratch style declaration: the per-node style is computed here first and
	// only written to the live element when the serialized string changed.
	const scratch = document.createElement("div");

	function computeStyleKey(
		node: SceneNode,
		rect: Rect,
		parentRect: Rect,
		isRoot: boolean,
	): string {
		scratch.style.cssText = "";
		applyBoxStyle(scratch.style, node, rect, parentRect, isRoot);
		return scratch.style.cssText;
	}

	function patchNode(
		node: SceneNode,
		positionalPath: string,
		isRoot: boolean,
		layout: LayoutResult,
		parentRect: Rect,
		seen: Set<string>,
	): HTMLDivElement | undefined {
		const id = node.id ?? positionalPath;
		const laidOut = layout.rects[id];
		if (!laidOut) return undefined;
		const rect = laidOut.rect;

		let entry = entries.get(id);
		if (!entry) {
			const el = document.createElement("div");
			el.dataset.loomId = id;
			entry = { el, textEl: undefined, styleKey: "", textKey: "" };
			entries.set(id, entry);
		}
		seen.add(id);
		const el = entry.el;
		if (el.dataset.loomClass !== node.className) {
			el.dataset.loomClass = node.className;
		}
		if (el.dataset.loomName !== node.name) el.dataset.loomName = node.name;

		const styleKey = computeStyleKey(node, rect, parentRect, isRoot);
		if (styleKey !== entry.styleKey) {
			el.style.cssText = styleKey;
			entry.styleKey = styleKey;
		}

		const textKey = textLayerKey(node);
		if (textKey !== entry.textKey) {
			entry.textEl?.remove();
			entry.textEl = textKey === "" ? undefined : createTextLayer(node);
			entry.textKey = textKey;
		}

		const desired: HTMLElement[] = [];
		if (entry.textEl) desired.push(entry.textEl);
		let i = 0;
		for (const child of childrenOf(node)) {
			if (!participatesInLayout(child.className)) continue;
			const childEl = patchNode(
				child,
				`${positionalPath}/${i}`,
				false,
				layout,
				rect,
				seen,
			);
			if (childEl) desired.push(childEl);
			i += 1;
		}
		syncChildren(el, desired);
		return el;
	}

	// --- input delegation ------------------------------------------------------

	/** Pointer position relative to the mount's top-left (= layout rect space). */
	function relPoint(e: MouseEvent): { x: number; y: number } {
		const bounds = mount.getBoundingClientRect();
		return { x: e.clientX - bounds.left, y: e.clientY - bounds.top };
	}

	/** Instance chain from the event target upward (innermost first). */
	function chainFromEvent(e: Event): LoomInstance[] {
		const chain: LoomInstance[] = [];
		const target = e.target;
		if (!(target instanceof Element)) return chain;
		let el: Element | null = target.closest("[data-loom-id]");
		while (el && mount.contains(el)) {
			const id = (el as HTMLElement).dataset.loomId;
			if (id) {
				const inst = options.resolveInstance(id);
				if (inst) chain.push(inst);
			}
			el = el.parentElement ? el.parentElement.closest("[data-loom-id]") : null;
		}
		return chain;
	}

	function pointerInput(
		e: PointerEvent,
		state: EnumItem<"UserInputState">,
	): InputObject {
		const { x, y } = relPoint(e);
		return makeInputObject({
			UserInputType:
				e.pointerType === "touch"
					? Enum.UserInputType.Touch
					: Enum.UserInputType.MouseButton1,
			UserInputState: state,
			Position: Vector3.new(x, y, 0),
		});
	}

	const userInputService = (): LoomInstance => getService("UserInputService");

	let pressed: LoomInstance | undefined;
	let hoverChain: LoomInstance[] = [];

	function onPointerDown(e: PointerEvent): void {
		const input = pointerInput(e, Enum.UserInputState.Begin);
		const chain = chainFromEvent(e);
		for (const inst of chain) {
			getEventSignal(inst, "InputBegan").fire(input);
		}
		getEventSignal(userInputService(), "InputBegan").fire(input, false);
		pressed = chain[0];
	}

	function onPointerUp(e: PointerEvent): void {
		const input = pointerInput(e, Enum.UserInputState.End);
		const chain = chainFromEvent(e);
		for (const inst of chain) {
			getEventSignal(inst, "InputEnded").fire(input);
		}
		if (pressed && chain.includes(pressed)) {
			getEventSignal(pressed, "Activated").fire(input, 1);
			if (pressed.IsA("GuiButton")) {
				getEventSignal(pressed, "MouseButton1Click").fire();
			}
		}
		getEventSignal(userInputService(), "InputEnded").fire(input, false);
		pressed = undefined;
	}

	function onPointerMove(e: PointerEvent): void {
		const { x, y } = relPoint(e);
		setMouseLocation(Vector2.new(x, y));
		const input = makeInputObject({
			UserInputType: Enum.UserInputType.MouseMovement,
			UserInputState: Enum.UserInputState.Change,
			Position: Vector3.new(x, y, 0),
			Delta: Vector3.new(e.movementX || 0, e.movementY || 0, 0),
		});
		const chain = chainFromEvent(e);
		for (const inst of chain) {
			getEventSignal(inst, "InputChanged").fire(input);
		}
		getEventSignal(userInputService(), "InputChanged").fire(input, false);
	}

	/** Diff the hover chain: MouseLeave for departed, MouseEnter for arrived. */
	function updateHover(next: LoomInstance[], x: number, y: number): void {
		const nextSet = new Set(next);
		const prevSet = new Set(hoverChain);
		for (const inst of hoverChain) {
			if (!nextSet.has(inst)) getEventSignal(inst, "MouseLeave").fire(x, y);
		}
		for (const inst of next) {
			if (!prevSet.has(inst)) getEventSignal(inst, "MouseEnter").fire(x, y);
		}
		hoverChain = next;
	}

	function onPointerOver(e: PointerEvent): void {
		const { x, y } = relPoint(e);
		updateHover(chainFromEvent(e), x, y);
	}

	function onPointerOut(e: PointerEvent): void {
		const related = e.relatedTarget;
		// Leaving the mount entirely: no pointerover follows, clear the chain here.
		if (related instanceof Node && mount.contains(related)) return;
		const { x, y } = relPoint(e);
		updateHover([], x, y);
	}

	mount.addEventListener("pointerdown", onPointerDown);
	mount.addEventListener("pointerup", onPointerUp);
	mount.addEventListener("pointermove", onPointerMove);
	mount.addEventListener("pointerover", onPointerOver);
	mount.addEventListener("pointerout", onPointerOut);

	function clear(): void {
		for (const entry of entries.values()) entry.el.remove();
		entries.clear();
		pressed = undefined;
		hoverChain = [];
	}

	return {
		patch(root: SceneNode, layout: LayoutResult): void {
			const seen = new Set<string>();
			const rootEl = patchNode(root, "0", true, layout, ZERO_RECT, seen);
			for (const [id, entry] of entries) {
				if (seen.has(id)) continue;
				entry.el.remove();
				entries.delete(id);
			}
			if (rootEl && rootEl.parentElement !== mount) mount.appendChild(rootEl);
		},
		clear,
		dispose(): void {
			mount.removeEventListener("pointerdown", onPointerDown);
			mount.removeEventListener("pointerup", onPointerUp);
			mount.removeEventListener("pointermove", onPointerMove);
			mount.removeEventListener("pointerover", onPointerOver);
			mount.removeEventListener("pointerout", onPointerOut);
			clear();
		},
	};
}
