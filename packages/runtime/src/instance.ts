/**
 * `instance.ts` — `LoomInstance`, the Proxy-based live Roblox instance.
 *
 * Every mounted GUI object is one of these: a property store + lazy signals
 * (per-property `GetPropertyChangedSignal` and Roblox events) + tree operations
 * (`FindFirstChild`, `IsA`, `Destroy`, …). React refs, event dispatch, motion's
 * direct property writes, and portal containers all share the same object.
 * Property writes mark the instance dirty so the scheduler re-flushes the world.
 */
import { Vector2 } from "./datatypes";
import { classChain, isA } from "./registry";
import { markDirty } from "./scheduler";
import { LoomSignal } from "./signal";

/** Roblox events the proxy exposes as lazily created signals. */
export const EVENT_NAMES: ReadonlySet<string> = new Set([
	"Activated",
	"MouseButton1Click",
	"MouseButton1Down",
	"MouseButton1Up",
	"MouseButton2Click",
	"InputBegan",
	"InputEnded",
	"InputChanged",
	"MouseEnter",
	"MouseLeave",
	"MouseMoved",
	"Focused",
	"FocusLost",
	"SelectionGained",
	"SelectionLost",
	"Changed",
	"ChildAdded",
	"ChildRemoved",
	"AncestryChanged",
	"Destroying",
]);

/**
 * The public face of a live instance. Arbitrary Roblox properties fall through
 * the index signature (`inst.Text`, `inst.BackgroundColor3`, …); the declared
 * members are the tree/reflection API every class shares.
 */
export interface LoomInstance {
	[key: string]: unknown;
	readonly ClassName: string;
	Name: string;
	Parent: LoomInstance | undefined;
	readonly AbsolutePosition: Vector2;
	readonly AbsoluteSize: Vector2;
	readonly Changed: LoomSignal<[string]>;
	readonly ChildAdded: LoomSignal<[LoomInstance]>;
	readonly ChildRemoved: LoomSignal<[LoomInstance]>;
	readonly AncestryChanged: LoomSignal<
		[LoomInstance, LoomInstance | undefined]
	>;
	readonly Destroying: LoomSignal<[]>;
	IsA(className: string): boolean;
	GetChildren(): LoomInstance[];
	GetDescendants(): LoomInstance[];
	FindFirstChild(name: string, recursive?: boolean): LoomInstance | undefined;
	FindFirstChildOfClass(className: string): LoomInstance | undefined;
	FindFirstAncestor(name: string): LoomInstance | undefined;
	FindFirstAncestorOfClass(className: string): LoomInstance | undefined;
	FindFirstAncestorWhichIsA(className: string): LoomInstance | undefined;
	WaitForChild(name: string, timeout?: number): LoomInstance | undefined;
	IsDescendantOf(ancestor: LoomInstance): boolean;
	GetPropertyChangedSignal(propertyName: string): LoomSignal<[]>;
	Destroy(): void;
	ClearAllChildren(): void;
	GetFullName(): string;
}

interface InstanceImpl {
	readonly id: string;
	readonly className: string;
	readonly props: Map<string, unknown>;
	parent: InstanceImpl | undefined;
	readonly children: InstanceImpl[];
	readonly propSignals: Map<string, LoomSignal<[]>>;
	readonly eventSignals: Map<string, LoomSignal<unknown[]>>;
	destroyed: boolean;
	absolutePosition: Vector2;
	absoluteSize: Vector2;
	proxy: LoomInstance;
}

let nextId = 0;

/** proxy → impl; also the `isLoomInstance` membership set. */
const IMPLS = new WeakMap<object, InstanceImpl>();

function getName(impl: InstanceImpl): string {
	return String(impl.props.get("Name") ?? impl.className);
}

function getOrCreatePropSignal(
	impl: InstanceImpl,
	key: string,
): LoomSignal<[]> {
	let signal = impl.propSignals.get(key);
	if (!signal) {
		signal = new LoomSignal();
		impl.propSignals.set(key, signal);
	}
	return signal;
}

function getOrCreateEventSignal(
	impl: InstanceImpl,
	name: string,
): LoomSignal<unknown[]> {
	let signal = impl.eventSignals.get(name);
	if (!signal) {
		signal = new LoomSignal();
		impl.eventSignals.set(name, signal);
	}
	return signal;
}

// --- shared instance methods -------------------------------------------------

function findFirstChildImpl(
	impl: InstanceImpl,
	name: string,
	recursive: boolean,
): InstanceImpl | undefined {
	for (const child of impl.children) {
		if (getName(child) === name) return child;
	}
	if (recursive) {
		for (const child of impl.children) {
			const found = findFirstChildImpl(child, name, true);
			if (found) return found;
		}
	}
	return undefined;
}

function collectDescendants(impl: InstanceImpl, out: LoomInstance[]): void {
	for (const child of impl.children) {
		out.push(child.proxy);
		collectDescendants(child, out);
	}
}

function destroyImpl(impl: InstanceImpl, detach: boolean): void {
	if (impl.destroyed) return;
	impl.eventSignals.get("Destroying")?.fire();
	if (detach && impl.parent) {
		const parent = impl.parent;
		const index = parent.children.indexOf(impl);
		if (index >= 0) parent.children.splice(index, 1);
		parent.eventSignals.get("ChildRemoved")?.fire(impl.proxy);
		markDirty(parent.proxy);
	}
	impl.parent = undefined;
	for (const child of [...impl.children]) destroyImpl(child, false);
	impl.children.length = 0;
	for (const signal of impl.propSignals.values()) signal.disconnectAll();
	for (const signal of impl.eventSignals.values()) signal.disconnectAll();
	impl.propSignals.clear();
	impl.eventSignals.clear();
	impl.destroyed = true;
}

const METHODS = {
	IsA(impl: InstanceImpl, className: string): boolean {
		return isA(impl.className, className);
	},
	GetChildren(impl: InstanceImpl): LoomInstance[] {
		return impl.children.map((child) => child.proxy);
	},
	GetDescendants(impl: InstanceImpl): LoomInstance[] {
		const out: LoomInstance[] = [];
		collectDescendants(impl, out);
		return out;
	},
	FindFirstChild(
		impl: InstanceImpl,
		name: string,
		recursive = false,
	): LoomInstance | undefined {
		return findFirstChildImpl(impl, name, recursive)?.proxy;
	},
	FindFirstChildOfClass(
		impl: InstanceImpl,
		className: string,
	): LoomInstance | undefined {
		for (const child of impl.children) {
			if (child.className === className) return child.proxy;
		}
		return undefined;
	},
	FindFirstAncestor(
		impl: InstanceImpl,
		name: string,
	): LoomInstance | undefined {
		for (let cur = impl.parent; cur; cur = cur.parent) {
			if (getName(cur) === name) return cur.proxy;
		}
		return undefined;
	},
	FindFirstAncestorOfClass(
		impl: InstanceImpl,
		className: string,
	): LoomInstance | undefined {
		for (let cur = impl.parent; cur; cur = cur.parent) {
			if (cur.className === className) return cur.proxy;
		}
		return undefined;
	},
	FindFirstAncestorWhichIsA(
		impl: InstanceImpl,
		className: string,
	): LoomInstance | undefined {
		for (let cur = impl.parent; cur; cur = cur.parent) {
			if (isA(cur.className, className)) return cur.proxy;
		}
		return undefined;
	},
	WaitForChild(
		impl: InstanceImpl,
		name: string,
		_timeout?: number,
	): LoomInstance | undefined {
		const found = findFirstChildImpl(impl, name, false);
		if (found) return found.proxy;
		console.warn(
			`[loom] WaitForChild("${name}") on ${METHODS.GetFullName(impl)}: ` +
				"child not found — the synchronous runtime returns undefined instead of yielding",
		);
		return undefined;
	},
	IsDescendantOf(impl: InstanceImpl, ancestor: LoomInstance): boolean {
		const ancestorImpl = IMPLS.get(ancestor);
		if (!ancestorImpl) return false;
		for (let cur = impl.parent; cur; cur = cur.parent) {
			if (cur === ancestorImpl) return true;
		}
		return false;
	},
	GetPropertyChangedSignal(
		impl: InstanceImpl,
		propertyName: string,
	): LoomSignal<[]> {
		return getOrCreatePropSignal(impl, propertyName);
	},
	Destroy(impl: InstanceImpl): void {
		destroyImpl(impl, true);
	},
	ClearAllChildren(impl: InstanceImpl): void {
		for (const child of [...impl.children]) destroyImpl(child, true);
	},
	GetFullName(impl: InstanceImpl): string {
		const names: string[] = [];
		for (let cur: InstanceImpl | undefined = impl; cur; cur = cur.parent) {
			if (cur.className !== "DataModel") names.unshift(getName(cur));
		}
		return names.join(".");
	},
} as const;

type MethodTable = Record<
	string,
	(impl: InstanceImpl, ...args: never[]) => unknown
>;

// --- class extension hooks ---------------------------------------------------

/** A method registered for one class (and inherited by subclasses). */
export type ClassMethod = (self: LoomInstance, ...args: never[]) => unknown;

const CLASS_METHODS = new Map<string, Record<string, ClassMethod>>();

/**
 * Register extra methods for a class (services use this: `GetService`,
 * `GetGuiInset`, `BindAction`, …). Methods are visible on every instance whose
 * class chain contains `className` and receive the proxy as `self`.
 */
export function registerClassMethods(
	className: string,
	methods: Record<string, ClassMethod>,
): void {
	const existing = CLASS_METHODS.get(className);
	CLASS_METHODS.set(className, { ...existing, ...methods });
}

function findClassMethod(
	className: string,
	key: string,
): ClassMethod | undefined {
	for (const cls of classChain(className)) {
		const methods = CLASS_METHODS.get(cls);
		const method = methods?.[key];
		if (method) return method;
	}
	return undefined;
}

/** A property write interceptor (e.g. `GuiService.SelectedObject`). */
export type PropertyInterceptor = (
	self: LoomInstance,
	value: unknown,
	setRaw: (value: unknown) => void,
) => void;

const PROPERTY_INTERCEPTORS = new Map<
	string,
	Map<string, PropertyInterceptor>
>();

/**
 * Intercept writes to `className.propertyName`. The interceptor decides when
 * (and whether) to call `setRaw`, which performs the normal store + signal +
 * dirty-mark path.
 */
export function registerPropertyInterceptor(
	className: string,
	propertyName: string,
	interceptor: PropertyInterceptor,
): void {
	let forClass = PROPERTY_INTERCEPTORS.get(className);
	if (!forClass) {
		forClass = new Map();
		PROPERTY_INTERCEPTORS.set(className, forClass);
	}
	forClass.set(propertyName, interceptor);
}

function findInterceptor(
	className: string,
	key: string,
): PropertyInterceptor | undefined {
	for (const cls of classChain(className)) {
		const interceptor = PROPERTY_INTERCEPTORS.get(cls)?.get(key);
		if (interceptor) return interceptor;
	}
	return undefined;
}

// --- TextBox focus adapter ---------------------------------------------------

/** DOM-side focus behavior for one TextBox (wired by the renderer in Phase 3). */
export interface TextBoxAdapter {
	CaptureFocus(): void;
	ReleaseFocus(enterPressed?: boolean): void;
	IsFocused(): boolean;
}

const TEXTBOX_ADAPTERS = new WeakMap<LoomInstance, TextBoxAdapter>();
const TEXTBOX_METHOD_NAMES: ReadonlySet<string> = new Set([
	"CaptureFocus",
	"ReleaseFocus",
	"IsFocused",
]);
let warnedNoTextBoxAdapter = false;

/** Attach the DOM focus adapter for a TextBox instance. */
export function registerTextBoxAdapter(
	inst: LoomInstance,
	adapter: TextBoxAdapter,
): void {
	TEXTBOX_ADAPTERS.set(inst, adapter);
}

function makeTextBoxMethod(
	impl: InstanceImpl,
	key: string,
): (...args: unknown[]) => unknown {
	return (...args: unknown[]): unknown => {
		const adapter = TEXTBOX_ADAPTERS.get(impl.proxy);
		if (!adapter) {
			if (!warnedNoTextBoxAdapter) {
				warnedNoTextBoxAdapter = true;
				console.warn(
					`[loom] TextBox.${key}() called before a text adapter was attached — no-op`,
				);
			}
			return key === "IsFocused" ? false : undefined;
		}
		switch (key) {
			case "CaptureFocus":
				return adapter.CaptureFocus();
			case "ReleaseFocus":
				return adapter.ReleaseFocus(...(args as [boolean?]));
			case "IsFocused":
				return adapter.IsFocused();
			default:
				return undefined;
		}
	};
}

// --- property writes ---------------------------------------------------------

function rawSet(impl: InstanceImpl, key: string, value: unknown): void {
	if (impl.props.get(key) === value) return;
	impl.props.set(key, value);
	impl.propSignals.get(key)?.fire();
	impl.eventSignals.get("Changed")?.fire(key);
	markDirty(impl.proxy);
}

function fireAncestryChanged(
	impl: InstanceImpl,
	parentProxy: LoomInstance | undefined,
): void {
	impl.eventSignals.get("AncestryChanged")?.fire(impl.proxy, parentProxy);
	for (const child of impl.children) {
		fireAncestryChanged(child, parentProxy);
	}
}

function setParent(impl: InstanceImpl, value: unknown): void {
	const newParent =
		value === undefined || value === null
			? undefined
			: IMPLS.get(value as object);
	if (value !== undefined && value !== null && !newParent) {
		throw new TypeError(
			`${getName(impl)}.Parent must be a LoomInstance or undefined`,
		);
	}
	if (newParent === impl.parent) return;
	for (let cur = newParent; cur; cur = cur.parent) {
		if (cur === impl) {
			throw new Error(
				`Setting ${getName(impl)}.Parent would create a circular reference`,
			);
		}
	}
	const oldParent = impl.parent;
	if (oldParent) {
		const index = oldParent.children.indexOf(impl);
		if (index >= 0) oldParent.children.splice(index, 1);
	}
	impl.parent = newParent;
	if (oldParent) oldParent.eventSignals.get("ChildRemoved")?.fire(impl.proxy);
	if (newParent) {
		newParent.children.push(impl);
		newParent.eventSignals.get("ChildAdded")?.fire(impl.proxy);
	}
	impl.propSignals.get("Parent")?.fire();
	fireAncestryChanged(impl, newParent?.proxy);
	if (oldParent) markDirty(oldParent.proxy);
	if (newParent) markDirty(newParent.proxy);
	markDirty(impl.proxy);
}

// --- the proxy ---------------------------------------------------------------

function getTrap(impl: InstanceImpl, key: string | symbol): unknown {
	if (typeof key !== "string") return undefined;
	switch (key) {
		case "ClassName":
			return impl.className;
		case "Parent":
			return impl.parent?.proxy;
		case "AbsolutePosition":
			return impl.absolutePosition;
		case "AbsoluteSize":
			return impl.absoluteSize;
		case "toString":
			// Debug/`tostring` friendliness: `String(inst)` yields the Name.
			return () => getName(impl);
		default:
			break;
	}
	if (Object.hasOwn(METHODS, key)) {
		const method = (METHODS as MethodTable)[key];
		if (method)
			return (...args: unknown[]) => method(impl, ...(args as never[]));
	}
	if (EVENT_NAMES.has(key) || impl.eventSignals.has(key)) {
		return getOrCreateEventSignal(impl, key);
	}
	if (TEXTBOX_METHOD_NAMES.has(key) && isA(impl.className, "TextBox")) {
		return makeTextBoxMethod(impl, key);
	}
	const classMethod = findClassMethod(impl.className, key);
	if (classMethod) {
		return (...args: unknown[]) =>
			classMethod(impl.proxy, ...(args as never[]));
	}
	return impl.props.get(key);
}

function setTrap(
	impl: InstanceImpl,
	key: string | symbol,
	value: unknown,
): void {
	if (typeof key !== "string") return;
	if (key === "Parent") {
		setParent(impl, value);
		return;
	}
	const interceptor = findInterceptor(impl.className, key);
	if (interceptor) {
		interceptor(impl.proxy, value, (raw) => rawSet(impl, key, raw));
		return;
	}
	rawSet(impl, key, value);
}

/**
 * Create a live instance. `Name` defaults to the class name, matching Roblox
 * `Instance.new`.
 */
export function createInstance(className: string, name?: string): LoomInstance {
	const props = new Map<string, unknown>();
	props.set("Name", name ?? className);
	const impl: InstanceImpl = {
		id: `i${++nextId}`,
		className,
		props,
		parent: undefined,
		children: [],
		propSignals: new Map(),
		eventSignals: new Map(),
		destroyed: false,
		absolutePosition: Vector2.zero,
		absoluteSize: Vector2.zero,
		proxy: undefined as unknown as LoomInstance,
	};
	const proxy = new Proxy({} as Record<string | symbol, unknown>, {
		get(_target, key) {
			return getTrap(impl, key);
		},
		set(_target, key, value) {
			setTrap(impl, key, value);
			return true;
		},
	}) as unknown as LoomInstance;
	impl.proxy = proxy;
	IMPLS.set(proxy, impl);
	return proxy;
}

/** Whether `value` is a live `LoomInstance` proxy. */
export function isLoomInstance(value: unknown): value is LoomInstance {
	return (
		typeof value === "object" && value !== null && IMPLS.has(value as object)
	);
}

/** The runtime-internal stable id (`"i1"`, `"i2"`, …) the renderer keys on. */
export function getInternalId(inst: LoomInstance): string {
	const impl = IMPLS.get(inst);
	if (!impl) throw new Error("getInternalId: value is not a LoomInstance");
	return impl.id;
}

/**
 * The event signal for `name`, created lazily — the dispatch side of the
 * proxy's event properties. The DOM bridge fires input events through this.
 */
export function getEventSignal(
	inst: LoomInstance,
	name: string,
): LoomSignal<unknown[]> {
	const impl = IMPLS.get(inst);
	if (!impl) throw new Error("getEventSignal: value is not a LoomInstance");
	return getOrCreateEventSignal(impl, name);
}

/**
 * The instance's raw property store (live, do not mutate) — the encode side of
 * the world walks this to build Scene IR properties.
 */
export function getRawProperties(
	inst: LoomInstance,
): ReadonlyMap<string, unknown> {
	const impl = IMPLS.get(inst);
	if (!impl) throw new Error("getRawProperties: value is not a LoomInstance");
	return impl.props;
}

/** Whether the instance has been `Destroy()`ed (encode skips dead nodes). */
export function isDestroyed(inst: LoomInstance): boolean {
	const impl = IMPLS.get(inst);
	if (!impl) throw new Error("isDestroyed: value is not a LoomInstance");
	return impl.destroyed;
}

/**
 * Reparent `child` under `parent` (when needed) and place it immediately before
 * `before` in the children array — the reconciler's `insertBefore`. Children
 * order drives Scene IR sibling order, so a reorder marks the parent dirty.
 * When `before` is absent (or not a child of `parent`), the child lands last.
 */
export function moveChildBefore(
	parent: LoomInstance,
	child: LoomInstance,
	before?: LoomInstance,
): void {
	const parentImpl = IMPLS.get(parent);
	const childImpl = IMPLS.get(child);
	if (!parentImpl || !childImpl) {
		throw new Error("moveChildBefore: values must be LoomInstances");
	}
	// Full reparent path first (signals, cycle checks) when not already a child.
	if (childImpl.parent !== parentImpl) child.Parent = parent;
	const children = parentImpl.children;
	const from = children.indexOf(childImpl);
	if (from < 0) return; // reparent failed (destroyed child) — nothing to order
	children.splice(from, 1);
	const beforeImpl = before ? IMPLS.get(before) : undefined;
	const to = beforeImpl ? children.indexOf(beforeImpl) : -1;
	if (to >= 0) children.splice(to, 0, childImpl);
	else children.push(childImpl);
	markDirty(parent);
}

/**
 * Write a property without firing signals or marking dirty — construction-time
 * plumbing for the service tree (`RunService.Heartbeat`, initial props, …).
 */
export function setRawProperty(
	inst: LoomInstance,
	key: string,
	value: unknown,
): void {
	const impl = IMPLS.get(inst);
	if (!impl) throw new Error("setRawProperty: value is not a LoomInstance");
	impl.props.set(key, value);
}

/**
 * Layout feedback: record the instance's absolute geometry after a flush and
 * fire the `AbsolutePosition`/`AbsoluteSize` property signals — but only for
 * the components that actually changed.
 */
export function updateAbsoluteGeometry(
	inst: LoomInstance,
	position: Vector2,
	size: Vector2,
): void {
	const impl = IMPLS.get(inst);
	if (!impl) {
		throw new Error("updateAbsoluteGeometry: value is not a LoomInstance");
	}
	const prevPosition = impl.absolutePosition;
	if (prevPosition.X !== position.X || prevPosition.Y !== position.Y) {
		impl.absolutePosition = position;
		impl.propSignals.get("AbsolutePosition")?.fire();
	}
	const prevSize = impl.absoluteSize;
	if (prevSize.X !== size.X || prevSize.Y !== size.Y) {
		impl.absoluteSize = size;
		impl.propSignals.get("AbsoluteSize")?.fire();
	}
}
