/**
 * `services.ts` — the fake Roblox service singletons.
 *
 * GuiService (selection + reduced motion), RunService (frame signals),
 * UserInputService (global input signals + focus/mouse stores), Players
 * (LocalPlayer → PlayerGui, pre-built so `WaitForChild` works synchronously),
 * Workspace (CurrentCamera + viewport size), a real CollectionService (the tag
 * registry behind `@rbxts/react`'s `Tag` prop), a no-op ContextActionService,
 * the deterministic slice of HttpService (`GenerateGUID` over Web Crypto, plus
 * JSON encoding), TextService measuring against the renderer's own fonts,
 * Debris on real timers, StarterGui's core-UI no-ops, and the services that are
 * only containers. Each is a real `LoomInstance` parented under `game`, so
 * `GetFullName`, `GetPropertyChangedSignal`, and `IsA` behave normally.
 */
import { Vector2 } from "./datatypes";
import { EnumItem } from "./enums";
import { getService, registerService } from "./game";
import {
	createInstance,
	getEventSignal,
	type LoomInstance,
	registerClassMethods,
	registerPropertyInterceptor,
	setRawProperty,
} from "./instance";
import { heartbeat, renderStepped } from "./scheduler";
import { type LoomConnection, LoomSignal } from "./signal";

// --- GuiService --------------------------------------------------------------

// Watches the currently selected instance so a `Destroy()` clears the
// selection automatically (Roblox behavior — a dead instance can't stay
// selected).
let selectedDestroyingConnection: LoomConnection | undefined;

// SelectedObject fires SelectionLost(old) → SelectionGained(new) → the
// GuiService "SelectedObject" property signal, in that order.
registerPropertyInterceptor(
	"GuiService",
	"SelectedObject",
	(self, value, setRaw) => {
		const old = self.SelectedObject as LoomInstance | undefined;
		const next = value as LoomInstance | undefined;
		if (old === next) return;
		selectedDestroyingConnection?.Disconnect();
		selectedDestroyingConnection = undefined;
		if (old) getEventSignal(old, "SelectionLost").fire();
		if (next) {
			getEventSignal(next, "SelectionGained").fire();
			selectedDestroyingConnection = getEventSignal(next, "Destroying").Connect(
				() => {
					self.SelectedObject = undefined;
				},
			);
		}
		setRaw(value);
	},
);

registerClassMethods("GuiService", {
	/** Tuple destructuring shape: `const [topLeft, bottomRight] = ...`. */
	GetGuiInset: () => [Vector2.zero, Vector2.zero],
});

registerService("GuiService", () => {
	const service = createInstance("GuiService", "GuiService");
	let reduced = false;
	if (typeof matchMedia === "function") {
		try {
			const query = matchMedia("(prefers-reduced-motion: reduce)");
			reduced = query.matches;
			query.addEventListener("change", (event) => {
				// Normal property path: fires the ReducedMotionEnabled signal.
				service.ReducedMotionEnabled = event.matches;
			});
		} catch {
			// Environments without media query support keep the default.
		}
	}
	setRawProperty(service, "ReducedMotionEnabled", reduced);
	return service;
});

// --- RunService --------------------------------------------------------------

registerClassMethods("RunService", {
	IsStudio: () => false,
	IsRunning: () => true,
	IsClient: () => true,
});

registerService("RunService", () => {
	const service = createInstance("RunService", "RunService");
	// The scheduler owns the frame loop; the service just exposes its signals.
	setRawProperty(service, "RenderStepped", renderStepped);
	setRawProperty(service, "Heartbeat", heartbeat);
	setRawProperty(service, "PostSimulation", heartbeat);
	return service;
});

// --- UserInputService --------------------------------------------------------

let focusedTextBox: LoomInstance | undefined;

/** DOM bridge hook: record which TextBox currently holds focus. */
export function setFocusedTextBox(inst: LoomInstance | undefined): void {
	focusedTextBox = inst;
}

/** The TextBox holding focus, if any (= `UserInputService.GetFocusedTextBox`). */
export function getFocusedTextBox(): LoomInstance | undefined {
	return focusedTextBox;
}

let mouseLocation = Vector2.zero;

/** DOM bridge hook: record the latest pointer position. */
export function setMouseLocation(position: Vector2): void {
	mouseLocation = position;
}

registerClassMethods("UserInputService", {
	GetFocusedTextBox: () => focusedTextBox,
	GetMouseLocation: () => mouseLocation,
});

registerService("UserInputService", () => {
	const service = createInstance("UserInputService", "UserInputService");
	setRawProperty(service, "MouseEnabled", true);
	setRawProperty(service, "TouchEnabled", false);
	setRawProperty(service, "KeyboardEnabled", true);
	setRawProperty(service, "GamepadEnabled", false);
	// InputBegan/InputChanged/InputEnded are lazy event signals on the
	// instance itself; the DOM bridge fires them via `getEventSignal`.
	return service;
});

// --- Players (pre-built: WaitForChild("PlayerGui") must work synchronously) --

let hitTester: ((x: number, y: number) => LoomInstance[]) | undefined;

/** World hook: rect-based hit testing behind `GetGuiObjectsAtPosition`. */
export function setHitTester(
	fn: ((x: number, y: number) => LoomInstance[]) | undefined,
): void {
	hitTester = fn;
}

registerClassMethods("PlayerGui", {
	GetGuiObjectsAtPosition: (_self: LoomInstance, x: number, y: number) =>
		hitTester ? hitTester(x, y) : [],
});

registerService("Players", () => {
	const players = createInstance("Players", "Players");
	const player = createInstance("Player", "Player");
	const playerGui = createInstance("PlayerGui", "PlayerGui");
	playerGui.Parent = player;
	player.Parent = players;
	setRawProperty(players, "LocalPlayer", player);
	return players;
});

// --- Workspace ---------------------------------------------------------------

registerService("Workspace", () => {
	const workspace = createInstance("Workspace", "Workspace");
	const camera = createInstance("Camera", "Camera");
	setRawProperty(camera, "ViewportSize", Vector2.new(1280, 720));
	camera.Parent = workspace;
	setRawProperty(workspace, "CurrentCamera", camera);
	return workspace;
});

/**
 * World hook: update `Workspace.CurrentCamera.ViewportSize`, firing its
 * property-changed signal when the size actually changes.
 */
export function setViewportSize(size: Vector2): void {
	const camera = getService("Workspace").CurrentCamera as LoomInstance;
	const current = camera.ViewportSize as Vector2;
	if (current.X === size.X && current.Y === size.Y) return;
	camera.ViewportSize = size;
}

// --- ContextActionService ----------------------------------------------------

registerClassMethods("ContextActionService", {
	BindAction: () => undefined,
	// `BindActionAtPriority` is `BindAction` plus a priority arg — the focus
	// manager binds Tab / D-pad navigation through it. Previews don't route real
	// ContextAction input, so a no-op is enough; omitting it threw
	// "BindActionAtPriority is not a function" and crashed every FocusScope
	// consumer (Select, Dialog, Tabs, …) the moment it opened.
	BindActionAtPriority: () => undefined,
	UnbindAction: () => undefined,
});

registerService("ContextActionService", () =>
	createInstance("ContextActionService", "ContextActionService"),
);

// --- HttpService -------------------------------------------------------------

/**
 * A fresh RFC 9562 (RFC 4122) version 4 UUID, lowercase and unbraced.
 *
 * `crypto.randomUUID` when the browser offers it (it is secure-context only),
 * otherwise the same value assembled from `crypto.getRandomValues` with the
 * version and variant bits set by hand. Never `Math.random`, never a timestamp
 * or a counter: app code uses a GUID as an identity, and a predictable one is a
 * bug waiting to be blamed on loom.
 */
function randomUuidV4(): string {
	const webCrypto = globalThis.crypto as Crypto | undefined;
	if (typeof webCrypto?.randomUUID === "function")
		return webCrypto.randomUUID();
	if (typeof webCrypto?.getRandomValues === "function") {
		const bytes = webCrypto.getRandomValues(new Uint8Array(16));
		// Version 4 in the high nibble of byte 6, variant 10xx in byte 8 — the two
		// fields `randomUUID` would have set for us.
		bytes[6] = ((bytes[6] as number) & 0x0f) | 0x40;
		bytes[8] = ((bytes[8] as number) & 0x3f) | 0x80;
		const hex = Array.from(bytes, (byte) =>
			byte.toString(16).padStart(2, "0"),
		).join("");
		return [
			hex.slice(0, 8),
			hex.slice(8, 12),
			hex.slice(12, 16),
			hex.slice(16, 20),
			hex.slice(20, 32),
		].join("-");
	}
	throw new Error(
		"[loom] HttpService.GenerateGUID requires the Web Crypto API",
	);
}

/** Every network method, with the one message that explains all of them. */
function networkUnsupported(method: string): () => never {
	return () => {
		throw new Error(
			`[loom] HttpService.${method} is not supported — loom previews render in ` +
				"the browser and never issue requests on your behalf. Call fetch (or " +
				"your own service layer) directly instead.",
		);
	};
}

/**
 * `HttpService` — the deterministic, browser-safe slice of the real service.
 *
 * `GenerateGUID` (Web Crypto) and the JSON pair are the whole of it: they are
 * pure computation with an unambiguous browser meaning, and they are what UI
 * code actually reaches for — component ids, serialized props. The network
 * methods throw by name rather than being silently absent, so a preview says
 * *why* it can't run that code instead of dying on `GetAsync is not a
 * function`; nothing here ever performs a request while documentation renders.
 *
 * `UrlEncode` is deliberately missing: the engine encodes more than
 * `encodeURIComponent` does (`.` becomes `%2E`), and the exact reserved set
 * could not be verified against a running engine — a near-miss encoder is worse
 * than an honest absence.
 */
registerClassMethods("HttpService", {
	GenerateGUID: (_self: LoomInstance, wrapInCurlyBraces = true) => {
		const guid = randomUuidV4();
		return wrapInCurlyBraces ? `{${guid}}` : guid;
	},
	// The Luau ↔ JSON mapping is `JSON.stringify`/`JSON.parse` here, because
	// loom's values *are* JavaScript values: what roblox-ts writes as an array or
	// an object is exactly what these encode. `undefined` encodes as `null` so the
	// declared string return always holds (`JSON.stringify(undefined)` is not a
	// string), matching `JSONEncode(nil)`.
	JSONEncode: (_self: LoomInstance, value: unknown) =>
		JSON.stringify(value) ?? "null",
	JSONDecode: (_self: LoomInstance, value: string) => {
		try {
			return JSON.parse(value) as unknown;
		} catch (cause) {
			throw new Error(
				"[loom] HttpService.JSONDecode could not parse the given string as JSON",
				{ cause },
			);
		}
	},
	GetAsync: networkUnsupported("GetAsync"),
	PostAsync: networkUnsupported("PostAsync"),
	RequestAsync: networkUnsupported("RequestAsync"),
});

registerService("HttpService", () =>
	createInstance("HttpService", "HttpService"),
);

// --- CollectionService -------------------------------------------------------

/**
 * Tags per instance, and the reverse index. Two maps rather than one: `GetTags`
 * and `GetTagged` are both O(1) lookups in Roblox, and the reverse index is
 * what `GetInstanceAddedSignal` fires from.
 *
 * The forward map is weak (an instance dropped by the app takes its tags with
 * it); the reverse index holds strong references, exactly as Roblox's does —
 * `GetTagged` must keep returning a tagged instance nobody else references.
 */
const INSTANCE_TAGS = new WeakMap<LoomInstance, Set<string>>();
const TAGGED = new Map<string, Set<LoomInstance>>();
const TAG_ADDED = new Map<string, LoomSignal<[LoomInstance]>>();
const TAG_REMOVED = new Map<string, LoomSignal<[LoomInstance]>>();

function tagSignal(
	registry: Map<string, LoomSignal<[LoomInstance]>>,
	tag: string,
): LoomSignal<[LoomInstance]> {
	let signal = registry.get(tag);
	if (!signal) {
		signal = new LoomSignal<[LoomInstance]>();
		registry.set(tag, signal);
	}
	return signal;
}

/**
 * `CollectionService` — the browser home for `@rbxts/react`'s `Tag` prop.
 *
 * Roblox's tag system is a plain string registry with change signals, none of
 * which needs the engine, so this is the real thing rather than a stand-in: the
 * adapter's `Tag` prop routes here (see `@loom-dev/react`), and app code that
 * queries tags — a theme pass walking `GetTagged("theme-surface")`, say — works
 * unchanged. What a preview does *not* have is Studio's tag editor, so tags only
 * ever come from code.
 */
registerClassMethods("CollectionService", {
	AddTag: (_self: LoomInstance, instance: LoomInstance, tag: string) => {
		let tags = INSTANCE_TAGS.get(instance);
		if (!tags) {
			tags = new Set();
			INSTANCE_TAGS.set(instance, tags);
		}
		if (tags.has(tag)) return undefined;
		tags.add(tag);
		let members = TAGGED.get(tag);
		if (!members) {
			members = new Set();
			TAGGED.set(tag, members);
		}
		members.add(instance);
		TAG_ADDED.get(tag)?.fire(instance);
		return undefined;
	},
	RemoveTag: (_self: LoomInstance, instance: LoomInstance, tag: string) => {
		const tags = INSTANCE_TAGS.get(instance);
		if (!tags?.delete(tag)) return undefined;
		TAGGED.get(tag)?.delete(instance);
		TAG_REMOVED.get(tag)?.fire(instance);
		return undefined;
	},
	HasTag: (_self: LoomInstance, instance: LoomInstance, tag: string) =>
		INSTANCE_TAGS.get(instance)?.has(tag) ?? false,
	// Roblox returns fresh arrays, so mutating a result can't corrupt the
	// registry.
	GetTags: (_self: LoomInstance, instance: LoomInstance) => [
		...(INSTANCE_TAGS.get(instance) ?? []),
	],
	GetTagged: (_self: LoomInstance, tag: string) => [...(TAGGED.get(tag) ?? [])],
	GetAllTags: () => [...TAGGED.keys()].filter((tag) => TAGGED.get(tag)?.size),
	GetInstanceAddedSignal: (_self: LoomInstance, tag: string) =>
		tagSignal(TAG_ADDED, tag),
	GetInstanceRemovedSignal: (_self: LoomInstance, tag: string) =>
		tagSignal(TAG_REMOVED, tag),
});

registerService("CollectionService", () =>
	createInstance("CollectionService", "CollectionService"),
);

/**
 * Drop every tag an instance carries — called when the adapter unmounts it, so
 * the strong reverse index doesn't pin a dead subtree. Fires the removal
 * signals, matching what Roblox does when a tagged instance is destroyed.
 */
export function clearTags(instance: LoomInstance): void {
	const tags = INSTANCE_TAGS.get(instance);
	if (!tags) return;
	INSTANCE_TAGS.delete(instance);
	for (const tag of tags) {
		TAGGED.get(tag)?.delete(instance);
		TAG_REMOVED.get(tag)?.fire(instance);
	}
}

// --- TextService -------------------------------------------------------------

/** How the host measures a string; `@loom-dev/renderer` installs a real one. */
export type TextMeasurer = (request: {
	text: string;
	size: number;
	/** A legacy `Enum.Font` name, or nothing for the default face. */
	font?: string;
	/** Wrap width in pixels; 0 or absent means no wrapping. */
	width?: number;
}) => { x: number; y: number };

let textMeasurer: TextMeasurer | undefined;
let warnedNoMeasurer = false;

/**
 * Install the text measurer behind `TextService`. The renderer calls this on
 * load — it is the half of loom that knows about fonts and canvases — so app
 * code sizing a label gets the same numbers the label will paint at.
 */
export function setTextMeasurer(measurer: TextMeasurer | undefined): void {
	textMeasurer = measurer;
}

/** The measurer's answer, or a warned-about estimate when none is installed. */
function measureString(
	text: string,
	size: number,
	font: unknown,
	width: number,
): Vector2 {
	const fontName =
		font instanceof EnumItem
			? font.Name
			: typeof font === "string" && font !== ""
				? font
				: undefined;
	if (textMeasurer) {
		const bounds = textMeasurer({
			text,
			size,
			...(fontName === undefined ? {} : { font: fontName }),
			width,
		});
		return new Vector2(bounds.x, bounds.y);
	}
	if (!warnedNoMeasurer) {
		warnedNoMeasurer = true;
		console.warn(
			"[loom] TextService has no text measurer installed — import " +
				"@loom-dev/renderer (every adapter does) for real measurements; " +
				"returning a rough estimate until then",
		);
	}
	// Deliberately crude, and warned about: half an em per character is wrong for
	// every font, but a zero would have UI code divide by nothing and lay out
	// against it as if it were the truth.
	return new Vector2(text.length * size * 0.5, text === "" ? 0 : size);
}

/**
 * `TextService` — the measurement half, which is the half a UI needs.
 *
 * `GetTextSize` and `GetTextBoundsAsync` both answer from the renderer's own
 * font stack, so a component that measures before it lays out agrees with what
 * lands on screen. Neither yields here (nothing to wait for in a browser), and
 * the filtering methods are absent: moderation is a server call loom will not
 * make on anyone's behalf.
 */
registerClassMethods("TextService", {
	GetTextSize: (
		_self: LoomInstance,
		text: string,
		fontSize: number,
		font?: unknown,
		frameSize?: Vector2,
	) => measureString(String(text ?? ""), fontSize, font, frameSize?.X ?? 0),
	// The modern spelling takes a `GetTextBoundsParams` instance instead of four
	// arguments; the properties it carries are the same measurement.
	GetTextBoundsAsync: (_self: LoomInstance, params: LoomInstance) =>
		measureString(
			String(params?.Text ?? ""),
			typeof params?.Size === "number" ? params.Size : 14,
			params?.Font,
			typeof params?.Width === "number" ? params.Width : 0,
		),
});

registerService("TextService", () =>
	createInstance("TextService", "TextService"),
);

// --- Debris ------------------------------------------------------------------

/**
 * `Debris` — the one-line lifetime service, which is a real timer here rather
 * than a stub: `AddItem(instance, 3)` genuinely destroys the instance three
 * seconds later, so a toast that cleans itself up behaves as it does in-game.
 */
registerClassMethods("Debris", {
	AddItem: (_self: LoomInstance, instance: LoomInstance, lifetime = 10) => {
		if (!instance) return undefined;
		setTimeout(() => {
			try {
				instance.Destroy();
			} catch {
				// Already destroyed, or never a live instance — either way there is
				// nothing left for the timer to clean up.
			}
		}, Math.max(0, lifetime) * 1000);
		return undefined;
	},
});

registerService("Debris", () => createInstance("Debris", "Debris"));

// --- StarterGui --------------------------------------------------------------

/**
 * `StarterGui` — a real container (app code parents `ScreenGui` templates into
 * it) whose `SetCore`/`GetCore` pair covers the core-UI toggles a preview has no
 * core UI to toggle. They are no-ops rather than absent so a mount that turns
 * the backpack off does not take the whole preview down with it; `GetCore`
 * answers `true`, which is what an untouched client reports.
 */
registerClassMethods("StarterGui", {
	SetCore: () => undefined,
	GetCore: () => true,
	SetCoreGuiEnabled: () => undefined,
	GetCoreGuiEnabled: () => true,
});

// --- plain containers --------------------------------------------------------

/**
 * The services that are *only* containers in a client: no behavior to model,
 * just a place instances live. Registering them turns `GetService` from a warned
 * stub into a plain instance — the same object every time, `IsA` correct, and
 * children that survive — which is all a preview ever needs from them.
 *
 * Anything not listed still resolves to a warned stub. That list stays
 * deliberate rather than exhaustive: a service loom cannot honestly model
 * (DataStores, marketplace, teleports) should say so by warning, not by looking
 * like it works.
 */
const CONTAINER_SERVICES = [
	"Lighting",
	"ReplicatedFirst",
	"ReplicatedStorage",
	"ServerScriptService",
	"ServerStorage",
	"SoundService",
	"StarterGui",
	"StarterPack",
	"StarterPlayer",
	"Teams",
] as const;

for (const name of CONTAINER_SERVICES) {
	registerService(name, () => createInstance(name, name));
}

// --- eager construction ------------------------------------------------------

// Pre-build the trees app code touches synchronously before the first render
// (`Players.LocalPlayer.WaitForChild("PlayerGui")`, camera viewport reads).
getService("Players");
getService("Workspace");
