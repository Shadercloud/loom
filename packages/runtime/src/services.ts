/**
 * `services.ts` — the fake Roblox service singletons.
 *
 * GuiService (selection + reduced motion), RunService (frame signals),
 * UserInputService (global input signals + focus/mouse stores), Players
 * (LocalPlayer → PlayerGui, pre-built so `WaitForChild` works synchronously),
 * Workspace (CurrentCamera + viewport size), and a no-op ContextActionService.
 * Each is a real `LoomInstance` parented under `game`, so `GetFullName`,
 * `GetPropertyChangedSignal`, and `IsA` behave normally.
 */
import { Vector2 } from "./datatypes";
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

// --- GuiService --------------------------------------------------------------

// SelectedObject fires SelectionLost(old) → SelectionGained(new) → the
// GuiService "SelectedObject" property signal, in that order.
registerPropertyInterceptor(
	"GuiService",
	"SelectedObject",
	(self, value, setRaw) => {
		const old = self.SelectedObject as LoomInstance | undefined;
		const next = value as LoomInstance | undefined;
		if (old === next) return;
		if (old) getEventSignal(old, "SelectionLost").fire();
		if (next) getEventSignal(next, "SelectionGained").fire();
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
	UnbindAction: () => undefined,
});

registerService("ContextActionService", () =>
	createInstance("ContextActionService", "ContextActionService"),
);

// --- eager construction ------------------------------------------------------

// Pre-build the trees app code touches synchronously before the first render
// (`Players.LocalPlayer.WaitForChild("PlayerGui")`, camera viewport reads).
getService("Players");
getService("Workspace");
