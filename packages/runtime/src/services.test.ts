import { describe, expect, it, vi } from "vitest";
import { Vector2 } from "./datatypes";
import { game } from "./game";
import { createInstance, type LoomInstance } from "./instance";
import { setViewportSize } from "./services";
import type { LoomSignal } from "./signal";

describe("game.GetService", () => {
	it("returns stable singletons", () => {
		const players = game.GetService("Players");
		expect(players).toBe(game.GetService("Players"));
		expect(players.ClassName).toBe("Players");
		expect(players.Parent).toBe(game);
	});

	it("stubs unknown services with a warning", () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		const stub = game.GetService("TeleportService");
		expect(stub.ClassName).toBe("TeleportService");
		expect(stub).toBe(game.GetService("TeleportService"));
		expect(warnSpy).toHaveBeenCalled();
		warnSpy.mockRestore();
	});
});

describe("Players", () => {
	it("pre-builds LocalPlayer with a synchronous PlayerGui", () => {
		const players = game.GetService("Players");
		const localPlayer = players.LocalPlayer as LoomInstance;
		expect(localPlayer.ClassName).toBe("Player");
		const playerGui = localPlayer.WaitForChild("PlayerGui");
		expect(playerGui).toBeDefined();
		expect(playerGui?.IsA("PlayerGui")).toBe(true);
		expect(playerGui?.IsA("BasePlayerGui")).toBe(true);
		expect(playerGui?.GetGuiObjectsAtPosition).toBeTypeOf("function");
		const atPosition = (
			playerGui?.GetGuiObjectsAtPosition as (
				x: number,
				y: number,
			) => LoomInstance[]
		)(10, 10);
		expect(atPosition).toEqual([]);
	});
});

describe("GuiService", () => {
	it("fires SelectionLost(old) → SelectionGained(new) → prop signal in order", () => {
		const guiService = game.GetService("GuiService");
		const a = createInstance("TextButton", "A");
		const b = createInstance("TextButton", "B");
		const order: string[] = [];
		(a.SelectionLost as LoomSignal<unknown[]>).Connect(() =>
			order.push("lost:A"),
		);
		(a.SelectionGained as LoomSignal<unknown[]>).Connect(() =>
			order.push("gained:A"),
		);
		(b.SelectionGained as LoomSignal<unknown[]>).Connect(() =>
			order.push("gained:B"),
		);
		guiService
			.GetPropertyChangedSignal("SelectedObject")
			.Connect(() => order.push("prop"));

		guiService.SelectedObject = a;
		expect(order).toEqual(["gained:A", "prop"]);
		expect(guiService.SelectedObject).toBe(a);

		guiService.SelectedObject = b;
		expect(order).toEqual(["gained:A", "prop", "lost:A", "gained:B", "prop"]);

		// Same value → nothing fires.
		guiService.SelectedObject = b;
		expect(order).toHaveLength(5);

		guiService.SelectedObject = undefined;
	});

	it("GetGuiInset returns a destructurable zero tuple", () => {
		const guiService = game.GetService("GuiService");
		const getGuiInset = guiService.GetGuiInset as () => [Vector2, Vector2];
		const [topLeft, bottomRight] = getGuiInset();
		expect(topLeft).toEqual(Vector2.zero);
		expect(bottomRight).toEqual(Vector2.zero);
	});

	it("exposes ReducedMotionEnabled as a boolean", () => {
		const guiService = game.GetService("GuiService");
		expect(guiService.ReducedMotionEnabled).toBeTypeOf("boolean");
	});
});

describe("RunService", () => {
	it("exposes frame signals and environment predicates", () => {
		const runService = game.GetService("RunService");
		const renderStepped = runService.RenderStepped as LoomSignal<[number]>;
		const heartbeat = runService.Heartbeat as LoomSignal<[number]>;
		expect(renderStepped.Connect).toBeTypeOf("function");
		expect(heartbeat.Connect).toBeTypeOf("function");
		expect(runService.PostSimulation).toBe(heartbeat);
		expect((runService.IsStudio as () => boolean)()).toBe(false);
		expect((runService.IsRunning as () => boolean)()).toBe(true);
		expect((runService.IsClient as () => boolean)()).toBe(true);
	});
});

describe("UserInputService", () => {
	it("exposes capability props and input signals", () => {
		const uis = game.GetService("UserInputService");
		expect(uis.MouseEnabled).toBe(true);
		expect(uis.TouchEnabled).toBe(false);
		expect(uis.KeyboardEnabled).toBe(true);
		expect(uis.GamepadEnabled).toBe(false);
		expect((uis.InputBegan as LoomSignal<unknown[]>).Connect).toBeTypeOf(
			"function",
		);
		expect(
			(uis.GetFocusedTextBox as () => LoomInstance | undefined)(),
		).toBeUndefined();
		expect((uis.GetMouseLocation as () => Vector2)()).toEqual(Vector2.zero);
	});
});

describe("Workspace", () => {
	it("pre-builds CurrentCamera and fires viewport size changes", () => {
		const workspace = game.GetService("Workspace");
		const camera = workspace.CurrentCamera as LoomInstance;
		expect(camera.ClassName).toBe("Camera");
		expect(camera.ViewportSize).toEqual(Vector2.new(1280, 720));

		const cb = vi.fn();
		camera.GetPropertyChangedSignal("ViewportSize").Connect(cb);
		setViewportSize(Vector2.new(800, 600));
		expect(cb).toHaveBeenCalledTimes(1);
		expect(camera.ViewportSize).toEqual(Vector2.new(800, 600));
		// Same size → no fire.
		setViewportSize(Vector2.new(800, 600));
		expect(cb).toHaveBeenCalledTimes(1);
		setViewportSize(Vector2.new(1280, 720));
	});
});

describe("ContextActionService", () => {
	it("BindAction/UnbindAction are safe no-ops", () => {
		const cas = game.GetService("ContextActionService");
		expect(() => {
			(cas.BindAction as (...args: unknown[]) => void)(
				"action",
				() => {},
				false,
			);
			(cas.UnbindAction as (...args: unknown[]) => void)("action");
		}).not.toThrow();
	});
});
