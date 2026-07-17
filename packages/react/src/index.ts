/// <reference path="./react-reconciler.d.ts" />
/**
 * `@loom-dev/react` — a custom React renderer for Roblox UI.
 *
 * A `react-reconciler` host config that creates and mutates live
 * `LoomInstance`s (the runtime's Proxy-based instance tree). React commits
 * mutate the instance tree; `resetAfterCommit` flushes the world synchronously
 * (encode → WASM layout → incremental DOM patch → layout feedback). Direct
 * property writes outside React (motion code via refs) mark instances dirty and
 * flush on the next scheduler frame through the same pipeline. `Event`/`Change`
 * props connect real signals, so the DOM session's input dispatch reaches app
 * handlers with Roblox `(rbx, ...args)` calling convention.
 */
import {
	initLayout,
	computeLayout as wasmComputeLayout,
} from "@loom-dev/layout";
import {
	createDomSession,
	type DomSession,
	fontFamily,
	fontWeight,
} from "@loom-dev/renderer";
import type {
	Color3,
	ColorSequence,
	LoomConnection,
	LoomInstance,
	UDim,
	UDim2,
} from "@loom-dev/runtime";
import {
	createInstance as createLoomInstance,
	EnumItem,
	flushDirtyNow,
	getEventSignal,
	getInternalId,
	getRawProperties,
	isLoomInstance,
	markDirty,
	moveChildBefore,
	setFlusher,
	setViewportSize,
	toPropertyValue,
	updateAbsoluteGeometry,
	Vector2,
} from "@loom-dev/runtime";
import type { LayoutResult, Viewport } from "@loom-dev/scene";
import { type PropertyValue, prop, type SceneNode } from "@loom-dev/scene";
import type { Key, ReactElement, ReactNode, Ref } from "react";
import Reconciler from "react-reconciler";
import { DefaultEventPriority } from "react-reconciler/constants";

type Props = Record<string, unknown>;

/** Roblox has no text nodes (text lives in a `Text` prop); these are dropped. */
interface TextInstance {
	readonly isText: true;
}
type HostNode = LoomInstance | TextInstance;
const TEXT_INSTANCE: TextInstance = { isText: true };

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

/** Instances hidden by Offscreen/Suspense (forced invisible in the IR). */
const HIDDEN = new WeakSet<LoomInstance>();

// --- adapter-owned signal connections ----------------------------------------

/** Connections this adapter made for one instance, keyed `"E:Name"`/`"C:Prop"`. */
const CONNECTIONS = new WeakMap<LoomInstance, Map<string, LoomConnection>>();

function connectionsOf(inst: LoomInstance): Map<string, LoomConnection> {
	let map = CONNECTIONS.get(inst);
	if (!map) {
		map = new Map();
		CONNECTIONS.set(inst, map);
	}
	return map;
}

/**
 * Reconcile one handler bag (`Event={{...}}` or `Change={{...}}`) against the
 * instance's live connections. Roblox calling convention: the instance comes
 * first, so `Event` handlers get `(inst, ...signalArgs)` — the DOM session
 * fires signals with the event args only — and `Change` handlers get `(inst)`.
 */
function syncHandlers(
	inst: LoomInstance,
	kind: "E" | "C",
	prevBag: unknown,
	nextBag: unknown,
): void {
	if (prevBag === nextBag) return;
	const prev = (prevBag ?? {}) as Record<string, unknown>;
	const next = (nextBag ?? {}) as Record<string, unknown>;
	const connections = connectionsOf(inst);
	for (const name of Object.keys(prev)) {
		if (next[name] === prev[name]) continue;
		const key = `${kind}:${name}`;
		connections.get(key)?.Disconnect();
		connections.delete(key);
	}
	for (const [name, handler] of Object.entries(next)) {
		if (typeof handler !== "function") continue;
		const key = `${kind}:${name}`;
		if (prev[name] === handler && connections.has(key)) continue;
		connections.get(key)?.Disconnect();
		const fn = handler as (...args: unknown[]) => void;
		const connection =
			kind === "E"
				? getEventSignal(inst, name).Connect((...args: unknown[]) =>
						fn(inst, ...args),
					)
				: inst.GetPropertyChangedSignal(name).Connect(() => fn(inst));
		connections.set(key, connection);
	}
}

/** Disconnect every adapter-made connection (instance leaves the tree). */
function disposeInstance(inst: LoomInstance): void {
	const connections = CONNECTIONS.get(inst);
	if (!connections) return;
	for (const connection of connections.values()) connection.Disconnect();
	connections.clear();
}

/** Diff-apply React props onto the live instance (plain props → proxy sets). */
function applyProps(inst: LoomInstance, prev: Props, next: Props): void {
	for (const key of Object.keys(prev)) {
		if (RESERVED.has(key) || key in next) continue;
		inst[key] = undefined; // dropped prop reverts to the class default
	}
	for (const [key, value] of Object.entries(next)) {
		if (RESERVED.has(key)) continue;
		if (prev[key] !== value) inst[key] = value;
	}
	if (prev.Name !== next.Name) {
		inst.Name = typeof next.Name === "string" ? next.Name : inst.ClassName;
	}
	syncHandlers(inst, "E", prev.Event, next.Event);
	syncHandlers(inst, "C", prev.Change, next.Change);
}

// --- encode: LoomInstance tree → Scene IR ------------------------------------

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
function measureTextBounds(inst: LoomInstance): PropertyValue | undefined {
	if (!TEXT_CLASSES.has(inst.ClassName)) return undefined;
	const auto = inst.AutomaticSize;
	const autoName = auto instanceof EnumItem ? auto.Name : undefined;
	if (autoName !== "X" && autoName !== "Y" && autoName !== "XY")
		return undefined;
	const text = inst.Text;
	if (typeof text !== "string" || text === "") return undefined;
	const ctx = getMeasureCtx();
	if (!ctx) return undefined;

	const size = typeof inst.TextSize === "number" ? inst.TextSize : 14;
	const font = inst.Font;
	const fontName = font instanceof EnumItem ? font.Name : undefined;
	ctx.font = `${fontWeight(fontName)} ${size}px ${fontFamily(fontName)}`;
	const lines = text.split("\n");
	let width = 0;
	for (const line of lines) {
		width = Math.max(width, ctx.measureText(line).width);
	}
	return prop.vector2({ x: Math.ceil(width), y: lines.length * size });
}

function encodeInstance(
	inst: LoomInstance,
	byId: Map<string, LoomInstance>,
): SceneNode {
	const id = getInternalId(inst);
	byId.set(id, inst);
	const node: SceneNode = {
		className: inst.ClassName,
		name: String(inst.Name ?? inst.ClassName),
		id,
	};
	const properties: Record<string, PropertyValue> = {};
	for (const [key, value] of getRawProperties(inst)) {
		if (key === "Name") continue; // the node name, not an IR property
		const pv = toPropertyValue(value);
		if (pv !== undefined) properties[key] = pv;
	}
	// Offscreen/Suspense hide forces invisibility regardless of the node's props.
	if (HIDDEN.has(inst)) properties.Visible = prop.bool(false);
	// Inject measured text bounds for auto-sizing text classes.
	const textBounds = measureTextBounds(inst);
	if (textBounds) properties.TextBounds = textBounds;
	if (Object.keys(properties).length > 0) node.properties = properties;
	const children = inst
		.GetChildren()
		.map((child) => encodeInstance(child, byId));
	if (children.length > 0) node.children = children;
	return node;
}

// --- the world ---------------------------------------------------------------

/** Layout function shape (`@loom-dev/layout`'s `computeLayout`); injectable. */
export type ComputeLayout = (
	root: SceneNode,
	viewport: Viewport,
) => LayoutResult;

export interface WorldOptions {
	/** Override the layout engine (tests inject a stub to skip WASM). */
	computeLayout?: ComputeLayout;
}

/**
 * The live pipeline behind one mount: a root container instance, the DOM
 * session, and the flush plumbing between them.
 */
export interface World {
	/** The container every top-level React child is parented under. */
	readonly rootInstance: LoomInstance;
	/** Encode → layout → DOM patch → layout feedback, right now. */
	flushSync(): void;
	/** Tear down the session, resize observer, and instance tree. */
	dispose(): void;
}

// If layout feedback keeps triggering synchronous React commits past this
// depth, the remaining work is deferred to the next scheduler frame.
const MAX_FLUSH_DEPTH = 8;

const WORLDS = new Set<WorldImpl>();
let flusherInstalled = false;

class WorldImpl implements World {
	readonly rootInstance: LoomInstance;
	private readonly mount: HTMLElement;
	private readonly session: DomSession;
	private readonly computeLayout: ComputeLayout;
	private readonly observer: ResizeObserver | undefined;
	private readonly byId = new Map<string, LoomInstance>();
	private depth = 0;
	private warnedDepth = false;
	private disposed = false;

	constructor(mount: HTMLElement, options?: WorldOptions) {
		this.mount = mount;
		this.computeLayout = options?.computeLayout ?? wasmComputeLayout;
		// A PlayerGui-shaped local root: Phase 4 turns this into the real
		// PlayerGui with multi-ScreenGui encoding; the encode below already
		// treats "one ScreenGui child" as the scene root, so it extends cleanly.
		this.rootInstance = createLoomInstance("PlayerGui", "LoomWorld");
		this.session = createDomSession(mount, {
			resolveInstance: (id) => this.byId.get(id),
		});
		if (typeof ResizeObserver === "function") {
			this.observer = new ResizeObserver(() => {
				if (this.disposed) return;
				setViewportSize(Vector2.new(mount.clientWidth, mount.clientHeight));
				this.flushSync();
			});
			this.observer.observe(mount);
		}
		WORLDS.add(this);
		if (!flusherInstalled) {
			flusherInstalled = true;
			// One scheduler flusher for every world: motion-driven dirty writes
			// (and `flushDirtyNow` from React commits) land here.
			setFlusher(() => {
				for (const world of [...WORLDS]) world.flushSync();
			});
		}
	}

	/** Scene root: the single top-level child, or a synthetic ScreenGui wrap. */
	private encodeRoot(): SceneNode | undefined {
		this.byId.clear();
		const children = this.rootInstance.GetChildren();
		const first = children[0];
		if (!first) return undefined;
		if (children.length === 1) return encodeInstance(first, this.byId);
		return {
			className: "ScreenGui",
			name: "LoomRoot",
			id: "loom-root",
			children: children.map((child) => encodeInstance(child, this.byId)),
		};
	}

	flushSync(): void {
		if (this.disposed) return;
		if (this.depth >= MAX_FLUSH_DEPTH) {
			if (!this.warnedDepth) {
				this.warnedDepth = true;
				console.warn(
					"loom react: layout feedback exceeded flush depth " +
						`${MAX_FLUSH_DEPTH} — deferring further work to the next frame`,
				);
			}
			markDirty(this.rootInstance);
			return;
		}
		this.depth += 1;
		try {
			const width = this.mount.clientWidth;
			const height = this.mount.clientHeight;
			if (width === 0 || height === 0) return; // wait for the mount to be sized
			const scene = this.encodeRoot();
			if (!scene) {
				this.session.clear();
				return;
			}
			const layout = this.computeLayout(scene, { width, height });
			this.session.patch(scene, layout);
			// Layout feedback: record absolute geometry, firing the
			// AbsolutePosition/AbsoluteSize signals only where it changed.
			for (const [id, entry] of Object.entries(layout.rects)) {
				const inst = this.byId.get(id);
				if (!inst) continue; // e.g. the synthetic "loom-root" wrapper
				updateAbsoluteGeometry(
					inst,
					Vector2.new(entry.rect.x, entry.rect.y),
					Vector2.new(entry.rect.width, entry.rect.height),
				);
			}
		} catch (err) {
			// A malformed scene or DOM error must never escape the commit phase;
			// degrade to a logged, contained failure.
			console.error("loom react:", err);
		} finally {
			this.depth -= 1;
		}
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		WORLDS.delete(this);
		this.observer?.disconnect();
		this.session.dispose();
		this.rootInstance.Destroy();
	}
}

/**
 * Create a world on `mount`. With the default WASM layout engine, await
 * {@link initLayout} (or use {@link render}) before the first flush; tests
 * inject `options.computeLayout` and skip WASM entirely.
 */
export function createWorld(mount: HTMLElement, options?: WorldOptions): World {
	return new WorldImpl(mount, options);
}

// --- host config -------------------------------------------------------------

const HOST_CONTEXT = {};

const hostConfig = {
	supportsMutation: true,
	supportsPersistence: false,
	supportsHydration: false,
	isPrimaryRenderer: true,
	noTimeout: -1 as const,
	scheduleTimeout: setTimeout,
	cancelTimeout: clearTimeout,

	createInstance(type: string, props: Props): LoomInstance {
		const instance = createLoomInstance(classNameOf(type));
		applyProps(instance, {}, props);
		return instance;
	},
	createTextInstance(): TextInstance {
		return TEXT_INSTANCE;
	},

	appendInitialChild(parent: LoomInstance, child: HostNode): void {
		if (!isLoomInstance(child)) return;
		child.Parent = parent;
	},
	appendChild(parent: LoomInstance, child: HostNode): void {
		if (!isLoomInstance(child)) return;
		moveChildBefore(parent, child);
	},
	appendChildToContainer(container: World, child: HostNode): void {
		if (!isLoomInstance(child)) return;
		moveChildBefore(container.rootInstance, child);
	},
	insertBefore(parent: LoomInstance, child: HostNode, before: HostNode): void {
		if (!isLoomInstance(child)) return;
		moveChildBefore(parent, child, isLoomInstance(before) ? before : undefined);
	},
	insertInContainerBefore(
		container: World,
		child: HostNode,
		before: HostNode,
	): void {
		if (!isLoomInstance(child)) return;
		moveChildBefore(
			container.rootInstance,
			child,
			isLoomInstance(before) ? before : undefined,
		);
	},
	removeChild(_parent: LoomInstance, child: HostNode): void {
		if (!isLoomInstance(child)) return;
		child.Parent = undefined;
	},
	removeChildFromContainer(_container: World, child: HostNode): void {
		if (!isLoomInstance(child)) return;
		child.Parent = undefined;
	},
	clearContainer(container: World): void {
		for (const child of container.rootInstance.GetChildren()) {
			child.Parent = undefined;
		}
	},

	finalizeInitialChildren(): boolean {
		return false;
	},
	prepareUpdate(
		_instance: LoomInstance,
		_type: string,
		oldProps: Props,
		newProps: Props,
	): Props | null {
		return shallowChanged(oldProps, newProps) ? newProps : null;
	},
	commitUpdate(
		instance: LoomInstance,
		_payload: unknown,
		_type: string,
		prevProps: Props,
		nextProps: Props,
	): void {
		applyProps(instance, prevProps, nextProps);
	},
	commitTextUpdate(): void {},
	// Required under supportsMutation: Offscreen/Suspense toggle these to hide/show
	// a subtree (a missing method throws and tears the subtree down).
	hideInstance(instance: LoomInstance): void {
		HIDDEN.add(instance);
		markDirty(instance);
	},
	unhideInstance(instance: LoomInstance): void {
		HIDDEN.delete(instance);
		markDirty(instance);
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
	/** Refs receive the live `LoomInstance` proxy (IsA, signals, prop writes). */
	getPublicInstance(instance: LoomInstance): LoomInstance {
		return instance;
	},

	prepareForCommit(): null {
		return null;
	},
	resetAfterCommit(): void {
		// Every mutating commit marked instances dirty; flush them through the
		// world pipeline synchronously so layout feedback lands in this commit.
		flushDirtyNow();
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
	detachDeletedInstance(instance: HostNode): void {
		if (!isLoomInstance(instance)) return;
		disposeInstance(instance);
	},
};

function shallowChanged(a: Props, b: Props): boolean {
	const ak = Object.keys(a);
	const bk = Object.keys(b);
	if (ak.length !== bk.length) return true;
	for (const k of ak) if (a[k] !== b[k]) return true;
	return false;
}

const reconciler = Reconciler(hostConfig);

// --- public API --------------------------------------------------------------

export interface LoomRoot {
	/** Unmount the tree and dispose the world (session, observer, instances). */
	unmount(): void;
}

/** `LoomRoot` plus the world handle (tests and tooling introspect it). */
export interface MountedWorld extends LoomRoot {
	readonly world: World;
}

/**
 * Mount a React element tree into a fresh world on `mount`, synchronously.
 * The default layout engine requires {@link initLayout} to have resolved —
 * use {@link render} unless you inject `options.computeLayout`.
 */
export function mountSync(
	element: ReactElement,
	mount: HTMLElement,
	options?: WorldOptions,
): MountedWorld {
	const world = createWorld(mount, options);
	const root = reconciler.createContainer(
		world,
		0, // LegacyRoot — synchronous commits, simplest for a preview
		null,
		false,
		null,
		"",
		(error) => console.error("loom react:", error),
		null,
	);
	reconciler.updateContainer(element, root, null, null);
	return {
		world,
		unmount() {
			reconciler.updateContainer(null, root, null, null);
			world.dispose();
		},
	};
}

/**
 * Render a React element tree of Roblox host elements into `mount`, as live,
 * interactive DOM. Awaits the WASM layout engine, then flushes on every commit,
 * on scheduler frames (motion writes), and on mount resize.
 */
export async function render(
	element: ReactElement,
	mount: HTMLElement,
): Promise<LoomRoot> {
	await initLayout();
	return mountSync(element, mount);
}

// --- JSX intrinsics -----------------------------------------------------------

/** `Event={{ Activated: (rbx, input, clickCount) => … }}` handler bag. */
export type EventHandlers = Record<
	string,
	(rbx: LoomInstance, ...args: never[]) => void
>;
/** `Change={{ Text: (rbx) => … }}` per-property changed handler bag. */
export type ChangeHandlers = Record<string, (rbx: LoomInstance) => void>;

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
	Event?: EventHandlers;
	Change?: ChangeHandlers;
	ref?: Ref<LoomInstance>;
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
