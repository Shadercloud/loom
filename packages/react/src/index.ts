/// <reference path="./react-reconciler.d.ts" />
/**
 * `@loom-dev/react` — a custom React renderer for Roblox UI.
 *
 * A `react-reconciler` host config that interprets Roblox host elements
 * (`<frame>`, `<screengui>`, …) and Roblox datatype props (UDim2/Color3/…),
 * builds a Scene IR tree, and drives the M1 pipeline (WASM layout + DOM render)
 * on every commit. This is the first frontend adapter; vide/luau plug into the
 * same Scene IR later.
 */
import { computeLayout, initLayout } from "@loom-dev/layout";
import { fontFamily, fontWeight, renderScene } from "@loom-dev/renderer";
import type {
	Color3,
	ColorSequence,
	UDim,
	UDim2,
	Vector2,
} from "@loom-dev/runtime";
import { EnumItem, toPropertyValue } from "@loom-dev/runtime";
import { type PropertyValue, prop, type SceneNode } from "@loom-dev/scene";
import type { Key, ReactElement, ReactNode } from "react";
import Reconciler from "react-reconciler";
import { DefaultEventPriority } from "react-reconciler/constants";

// --- internal node model -----------------------------------------------------

type Props = Record<string, unknown>;

interface Instance {
	className: string;
	name: string;
	id: string;
	props: Props;
	children: Node[];
	/** Set by Offscreen/Suspense hide; forces the node invisible in the IR. */
	hidden: boolean;
}
/** Roblox has no text nodes (text lives in a `Text` prop); these are dropped. */
interface TextInstance {
	readonly isText: true;
}
type Node = Instance | TextInstance;

interface Container {
	children: Node[];
	mount: HTMLElement;
	lastRoot: SceneNode | undefined;
	/** The last (root, size) actually rendered, to dedup redundant relayouts. */
	lastRendered: { root: SceneNode; width: number; height: number } | undefined;
}

const isInstance = (n: Node): n is Instance => !("isText" in n);

// --- host element + prop mapping ---------------------------------------------

// Roblox JSX intrinsics are lowercased class names; map back to real casing.
const CLASS_NAMES: Record<string, string> = {
	screengui: "ScreenGui",
	surfacegui: "SurfaceGui",
	billboardgui: "BillboardGui",
	frame: "Frame",
	scrollingframe: "ScrollingFrame",
	canvasgroup: "CanvasGroup",
	textlabel: "TextLabel",
	textbutton: "TextButton",
	textbox: "TextBox",
	imagelabel: "ImageLabel",
	imagebutton: "ImageButton",
	viewportframe: "ViewportFrame",
	videoframe: "VideoFrame",
	uilistlayout: "UIListLayout",
	uigridlayout: "UIGridLayout",
	uipadding: "UIPadding",
	uicorner: "UICorner",
	uistroke: "UIStroke",
	uigradient: "UIGradient",
	uiaspectratioconstraint: "UIAspectRatioConstraint",
	uisizeconstraint: "UISizeConstraint",
	uiscale: "UIScale",
	uiflexitem: "UIFlexItem",
};
function classNameOf(type: string): string {
	return CLASS_NAMES[type] ?? type.charAt(0).toUpperCase() + type.slice(1);
}

// Props that are not Roblox instance properties (handled elsewhere / ignored).
const RESERVED = new Set(["children", "Name", "key", "ref", "Event", "Change"]);

const TEXT_CLASSES = new Set(["TextLabel", "TextButton", "TextBox"]);
let measureCtx: CanvasRenderingContext2D | null | undefined;
function getMeasureCtx(): CanvasRenderingContext2D | null {
	if (measureCtx === undefined) {
		measureCtx =
			typeof document !== "undefined"
				? document.createElement("canvas").getContext("2d")
				: null;
	}
	return measureCtx;
}

/**
 * Measure an auto-sizing text node's pixel bounds with the same font the renderer
 * paints, and emit them as a `TextBounds` Vector2 the layout engine reads for
 * AutomaticSize (font metrics live browser-side, not in the WASM engine).
 */
function measureTextBounds(inst: Instance): PropertyValue | undefined {
	if (!TEXT_CLASSES.has(inst.className)) return undefined;
	const auto = inst.props.AutomaticSize;
	const autoName = auto instanceof EnumItem ? auto.Name : undefined;
	if (autoName !== "X" && autoName !== "Y" && autoName !== "XY")
		return undefined;
	const text = inst.props.Text;
	if (typeof text !== "string" || text === "") return undefined;
	const ctx = getMeasureCtx();
	if (!ctx) return undefined;

	const size =
		typeof inst.props.TextSize === "number" ? inst.props.TextSize : 14;
	const font = inst.props.Font;
	const fontName = font instanceof EnumItem ? font.Name : undefined;
	ctx.font = `${fontWeight(fontName)} ${size}px ${fontFamily(fontName)}`;
	const lines = text.split("\n");
	let width = 0;
	for (const line of lines) {
		width = Math.max(width, ctx.measureText(line).width);
	}
	return prop.vector2({ x: Math.ceil(width), y: lines.length * size });
}

function convertProps(props: Props): Record<string, PropertyValue> {
	const out: Record<string, PropertyValue> = {};
	for (const [k, v] of Object.entries(props)) {
		if (RESERVED.has(k)) continue;
		const pv = toPropertyValue(v);
		if (pv !== undefined) out[k] = pv;
	}
	return out;
}

function toSceneNode(inst: Instance): SceneNode {
	const node: SceneNode = {
		className: inst.className,
		name: inst.name,
		id: inst.id,
	};
	const properties = convertProps(inst.props);
	// Offscreen/Suspense hide forces invisibility regardless of the node's props.
	if (inst.hidden) properties.Visible = prop.bool(false);
	// Inject measured text bounds for auto-sizing text classes.
	const textBounds = measureTextBounds(inst);
	if (textBounds) properties.TextBounds = textBounds;
	if (Object.keys(properties).length > 0) node.properties = properties;
	const children = inst.children.filter(isInstance).map(toSceneNode);
	if (children.length > 0) node.children = children;
	return node;
}

function buildRoot(children: Node[]): SceneNode | undefined {
	const roots = children.filter(isInstance);
	const first = roots[0];
	if (!first) return undefined;
	if (roots.length === 1) return toSceneNode(first);
	// Multiple top-level GUIs: wrap them in a transparent ScreenGui root.
	return {
		className: "ScreenGui",
		name: "LoomRoot",
		id: "loom-root",
		children: roots.map(toSceneNode),
	};
}

function relayout(container: Container): void {
	const root = container.lastRoot;
	if (!root) {
		container.mount.replaceChildren();
		container.lastRendered = undefined;
		return;
	}
	const width = container.mount.clientWidth;
	const height = container.mount.clientHeight;
	if (width === 0 || height === 0) return; // wait for the mount to be sized
	const prev = container.lastRendered;
	if (
		prev &&
		prev.root === root &&
		prev.width === width &&
		prev.height === height
	) {
		return; // unchanged (e.g. the ResizeObserver's initial no-op callback)
	}
	try {
		const layout = computeLayout(root, { width, height });
		renderScene(root, layout, container.mount);
		container.lastRendered = { root, width, height };
	} catch (err) {
		// A malformed scene or DOM error must never escape the commit phase or the
		// ResizeObserver callback; degrade to a logged, contained failure.
		console.error("loom react:", err);
	}
}

function shallowChanged(a: Props, b: Props): boolean {
	const ak = Object.keys(a);
	const bk = Object.keys(b);
	if (ak.length !== bk.length) return true;
	for (const k of ak) if (a[k] !== b[k]) return true;
	return false;
}

// --- host config -------------------------------------------------------------

let nextId = 0;
const HOST_CONTEXT = {};

const hostConfig = {
	supportsMutation: true,
	supportsPersistence: false,
	supportsHydration: false,
	isPrimaryRenderer: true,
	noTimeout: -1 as const,
	scheduleTimeout: setTimeout,
	cancelTimeout: clearTimeout,

	createInstance(type: string, props: Props): Instance {
		const className = classNameOf(type);
		return {
			className,
			name: typeof props.Name === "string" ? props.Name : className,
			id: `n${nextId++}`,
			props,
			children: [],
			hidden: false,
		};
	},
	createTextInstance(): TextInstance {
		return { isText: true };
	},

	appendInitialChild(parent: Instance, child: Node): void {
		parent.children.push(child);
	},
	appendChild(parent: Instance, child: Node): void {
		parent.children.push(child);
	},
	appendChildToContainer(container: Container, child: Node): void {
		container.children.push(child);
	},
	insertBefore(parent: Instance, child: Node, before: Node): void {
		const i = parent.children.indexOf(before);
		parent.children.splice(i < 0 ? parent.children.length : i, 0, child);
	},
	insertInContainerBefore(
		container: Container,
		child: Node,
		before: Node,
	): void {
		const i = container.children.indexOf(before);
		container.children.splice(i < 0 ? container.children.length : i, 0, child);
	},
	removeChild(parent: Instance, child: Node): void {
		const i = parent.children.indexOf(child);
		if (i >= 0) parent.children.splice(i, 1);
	},
	removeChildFromContainer(container: Container, child: Node): void {
		const i = container.children.indexOf(child);
		if (i >= 0) container.children.splice(i, 1);
	},
	clearContainer(container: Container): void {
		container.children = [];
	},

	finalizeInitialChildren(): boolean {
		return false;
	},
	prepareUpdate(
		_instance: Instance,
		_type: string,
		oldProps: Props,
		newProps: Props,
	): Props | null {
		return shallowChanged(oldProps, newProps) ? newProps : null;
	},
	commitUpdate(
		instance: Instance,
		_payload: unknown,
		_type: string,
		_prevProps: Props,
		nextProps: Props,
	): void {
		instance.props = nextProps;
		// Revert to the className default when the Name prop is dropped.
		instance.name =
			typeof nextProps.Name === "string" ? nextProps.Name : instance.className;
	},
	commitTextUpdate(): void {},
	// Required under supportsMutation: Offscreen/Suspense toggle these to hide/show
	// a subtree (a missing method throws and tears the subtree down).
	hideInstance(instance: Instance): void {
		instance.hidden = true;
	},
	unhideInstance(instance: Instance): void {
		instance.hidden = false;
	},
	hideTextInstance(): void {},
	unhideTextInstance(): void {},
	shouldSetTextContent(): boolean {
		return false;
	},

	getRootHostContext(): object {
		return HOST_CONTEXT;
	},
	getChildHostContext(): object {
		return HOST_CONTEXT;
	},
	getPublicInstance(instance: Instance): Instance {
		return instance;
	},

	prepareForCommit(): null {
		return null;
	},
	resetAfterCommit(container: Container): void {
		container.lastRoot = buildRoot(container.children);
		relayout(container);
	},
	preparePortalMount(): void {},
	getCurrentEventPriority(): number {
		return DefaultEventPriority;
	},

	getInstanceFromNode(): null {
		return null;
	},
	beforeActiveInstanceBlur(): void {},
	afterActiveInstanceBlur(): void {},
	prepareScopeUpdate(): void {},
	getInstanceFromScope(): null {
		return null;
	},
	detachDeletedInstance(): void {},
};

const reconciler = Reconciler(hostConfig);

// --- public API --------------------------------------------------------------

export interface LoomRoot {
	/** Unmount the tree and stop reacting to container resizes. */
	unmount(): void;
}

/**
 * Render a React element tree of Roblox host elements into `mount`, as live DOM.
 * Awaits the WASM layout engine, then re-layouts on every commit and on mount
 * resize.
 */
export async function render(
	element: ReactElement,
	mount: HTMLElement,
): Promise<LoomRoot> {
	await initLayout();
	const container: Container = {
		children: [],
		mount,
		lastRoot: undefined,
		lastRendered: undefined,
	};
	const root = reconciler.createContainer(
		container,
		0, // LegacyRoot — synchronous commits, simplest for a preview
		null,
		false,
		null,
		"",
		(error) => console.error("loom react:", error),
		null,
	);
	const observer = new ResizeObserver(() => relayout(container));
	observer.observe(mount);
	reconciler.updateContainer(element, root, null, null);
	return {
		unmount() {
			observer.disconnect();
			reconciler.updateContainer(null, root, null, null);
		},
	};
}

// --- JSX intrinsics -----------------------------------------------------------

/** Common GuiObject props. Enum props take the matching runtime `EnumItem`. */
export interface GuiProps {
	Name?: string;
	Size?: UDim2;
	Position?: UDim2;
	AnchorPoint?: Vector2;
	BackgroundColor3?: Color3;
	BackgroundTransparency?: number;
	Visible?: boolean;
	ZIndex?: number;
	LayoutOrder?: number;
	AutomaticSize?: EnumItem<"AutomaticSize">;
	ClipsDescendants?: boolean;
	key?: Key;
	children?: ReactNode;
}

/** Text classes (TextLabel/TextButton/TextBox) add the `Text*` props. */
export interface TextGuiProps extends GuiProps {
	Text?: string;
	TextColor3?: Color3;
	TextSize?: number;
	TextTransparency?: number;
	TextWrapped?: boolean;
	TextScaled?: boolean;
	TextXAlignment?: EnumItem<"TextXAlignment">;
	TextYAlignment?: EnumItem<"TextYAlignment">;
	Font?: EnumItem<"Font">;
}

/** `ScrollingFrame` adds a scroll canvas. */
export interface ScrollingFrameProps extends GuiProps {
	CanvasSize?: UDim2;
	ScrollBarThickness?: number;
}

/** `UIListLayout` props. */
export interface UIListLayoutProps {
	FillDirection?: EnumItem<"FillDirection">;
	HorizontalAlignment?: EnumItem<"HorizontalAlignment">;
	VerticalAlignment?: EnumItem<"VerticalAlignment">;
	SortOrder?: EnumItem<"SortOrder">;
	Padding?: UDim;
	key?: Key;
}

/** `UIGridLayout` props. */
export interface UIGridLayoutProps {
	CellSize?: UDim2;
	CellPadding?: UDim2;
	FillDirection?: EnumItem<"FillDirection">;
	FillDirectionMaxCells?: number;
	StartCorner?: EnumItem<"StartCorner">;
	HorizontalAlignment?: EnumItem<"HorizontalAlignment">;
	VerticalAlignment?: EnumItem<"VerticalAlignment">;
	SortOrder?: EnumItem<"SortOrder">;
	key?: Key;
}

/** `UIPadding` props (each side a `UDim`). */
export interface UIPaddingProps {
	PaddingLeft?: UDim;
	PaddingRight?: UDim;
	PaddingTop?: UDim;
	PaddingBottom?: UDim;
	key?: Key;
}

/** `UIAspectRatioConstraint` props. */
export interface UIAspectRatioConstraintProps {
	AspectRatio?: number;
	AspectType?: EnumItem<"AspectType">;
	DominantAxis?: EnumItem<"DominantAxis">;
	key?: Key;
}

/** `UISizeConstraint` props. */
export interface UISizeConstraintProps {
	MinSize?: Vector2;
	MaxSize?: Vector2;
	key?: Key;
}

/** `UICorner` props. */
export interface UICornerProps {
	CornerRadius?: UDim;
	key?: Key;
}

/** `UIStroke` props. */
export interface UIStrokeProps {
	Color?: Color3;
	Thickness?: number;
	Transparency?: number;
	ApplyStrokeMode?: EnumItem<"ApplyStrokeMode">;
	key?: Key;
}

/** `UIScale` props. */
export interface UIScaleProps {
	Scale?: number;
	key?: Key;
}

/** Modifier stubs whose props land with their feature milestone. */
export interface UIFlexItemProps {
	key?: Key;
}
/** `UIGradient` props (Transparency NumberSequence is deferred). */
export interface UIGradientProps {
	Color?: ColorSequence;
	Rotation?: number;
	Offset?: Vector2;
	Enabled?: boolean;
	key?: Key;
}

declare global {
	namespace JSX {
		interface IntrinsicElements {
			screengui: GuiProps;
			surfacegui: GuiProps;
			billboardgui: GuiProps;
			frame: GuiProps;
			scrollingframe: ScrollingFrameProps;
			canvasgroup: GuiProps;
			viewportframe: GuiProps;
			videoframe: GuiProps;
			textlabel: TextGuiProps;
			textbutton: TextGuiProps;
			textbox: TextGuiProps;
			imagelabel: GuiProps;
			imagebutton: GuiProps;
			uilistlayout: UIListLayoutProps;
			uigridlayout: UIGridLayoutProps;
			uipadding: UIPaddingProps;
			uiaspectratioconstraint: UIAspectRatioConstraintProps;
			uisizeconstraint: UISizeConstraintProps;
			uicorner: UICornerProps;
			uistroke: UIStrokeProps;
			uiscale: UIScaleProps;
			uiflexitem: UIFlexItemProps;
			uigradient: UIGradientProps;
		}
	}
}
