import { afterEach, describe, expect, it, vi } from "vitest";
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

	it("clears SelectedObject automatically when the selected instance is destroyed", () => {
		const guiService = game.GetService("GuiService");
		const doomed = createInstance("TextButton", "Doomed");
		const order: string[] = [];
		guiService
			.GetPropertyChangedSignal("SelectedObject")
			.Connect(() => order.push("prop"));

		guiService.SelectedObject = doomed;
		expect(guiService.SelectedObject).toBe(doomed);

		doomed.Destroy();
		expect(guiService.SelectedObject).toBeUndefined();
		expect(order).toEqual(["prop", "prop"]);

		// A later selection still works normally (the destroy hook detached).
		const next = createInstance("TextButton", "Next");
		guiService.SelectedObject = next;
		expect(guiService.SelectedObject).toBe(next);
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
	it("BindAction/BindActionAtPriority/UnbindAction are safe no-ops", () => {
		const cas = game.GetService("ContextActionService");
		expect(() => {
			(cas.BindAction as (...args: unknown[]) => void)(
				"action",
				() => {},
				false,
			);
			(cas.BindActionAtPriority as (...args: unknown[]) => void)(
				"action",
				() => {},
				false,
				1000,
			);
			(cas.UnbindAction as (...args: unknown[]) => void)("action");
		}).not.toThrow();
	});
});

describe("HttpService", () => {
	/** RFC 9562 v4: version nibble `4`, variant nibble `8`/`9`/`a`/`b`. */
	const UUID_V4 =
		/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

	const http = (): LoomInstance => game.GetService("HttpService");
	const generateGUID = (...args: [] | [boolean]): string =>
		(http().GenerateGUID as (wrapInCurlyBraces?: boolean) => string)(...args);

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("is a real service instance, not a plain object", () => {
		const service = http();
		expect(service.ClassName).toBe("HttpService");
		expect(service.Name).toBe("HttpService");
		expect(service.Parent).toBe(game);
		expect(service.IsA("HttpService")).toBe(true);
		expect(service.IsA("Instance")).toBe(true);
		expect(service.GetFullName()).toBe("HttpService");
	});

	it("returns the same cached singleton every time", () => {
		expect(http()).toBe(http());
	});

	it("GenerateGUID(false) returns a bare v4 UUID", () => {
		const guid = generateGUID(false);
		expect(guid).toMatch(UUID_V4);
		expect(guid).toHaveLength(36);
	});

	it("GenerateGUID(true) wraps the same value in curly braces", () => {
		const guid = generateGUID(true);
		expect(guid.startsWith("{")).toBe(true);
		expect(guid.endsWith("}")).toBe(true);
		expect(guid.slice(1, -1)).toMatch(UUID_V4);
	});

	it("defaults wrapInCurlyBraces to true, as Roblox does", () => {
		expect(generateGUID()).toMatch(/^\{.+\}$/);
		expect(generateGUID().slice(1, -1)).toMatch(UUID_V4);
	});

	it("returns a fresh value on every call", () => {
		const guids = new Set(Array.from({ length: 8 }, () => generateGUID(false)));
		expect(guids.size).toBe(8);
	});

	it("never falls back to Math.random", () => {
		const randomSpy = vi.spyOn(Math, "random");
		for (let i = 0; i < 4; i++) expect(generateGUID(false)).toMatch(UUID_V4);
		expect(randomSpy).not.toHaveBeenCalled();
	});

	it("generates a valid v4 UUID from getRandomValues alone", () => {
		// No `randomUUID` — the shape of a non-secure browsing context.
		const source = globalThis.crypto;
		vi.stubGlobal("crypto", {
			getRandomValues: (array: Uint8Array) => source.getRandomValues(array),
		});
		const guid = generateGUID(false);
		expect(guid).toMatch(UUID_V4);
		expect(generateGUID(false)).not.toBe(guid);
	});

	it("sets the version and variant bits itself in the fallback", () => {
		// All-zero entropy: whatever survives is what the implementation wrote.
		vi.stubGlobal("crypto", {
			getRandomValues: (array: Uint8Array) => array.fill(0),
		});
		expect(generateGUID(false)).toBe("00000000-0000-4000-8000-000000000000");
		// …and all-ones, for the other end of each masked nibble.
		vi.stubGlobal("crypto", {
			getRandomValues: (array: Uint8Array) => array.fill(0xff),
		});
		expect(generateGUID(false)).toBe("ffffffff-ffff-4fff-bfff-ffffffffffff");
	});

	it("throws an explicit loom error without Web Crypto", () => {
		vi.stubGlobal("crypto", undefined);
		expect(() => generateGUID(false)).toThrow(
			"[loom] HttpService.GenerateGUID requires the Web Crypto API",
		);
		// Not a weak identifier quietly handed back instead.
		vi.stubGlobal("crypto", {});
		expect(() => generateGUID(false)).toThrow(/Web Crypto API/);
	});

	it("round-trips JSON", () => {
		const service = http();
		const encode = service.JSONEncode as (value: unknown) => string;
		const decode = service.JSONDecode as (value: string) => unknown;
		expect(encode({ a: 1, b: [true, "x"] })).toBe('{"a":1,"b":[true,"x"]}');
		expect(decode('{"a":1,"b":[true,"x"]}')).toEqual({ a: 1, b: [true, "x"] });
		// `nil` encodes as null rather than returning a non-string.
		expect(encode(undefined)).toBe("null");
		expect(decode("null")).toBeNull();
		expect(() => decode("{oops")).toThrow(/\[loom\] HttpService\.JSONDecode/);
	});

	it("refuses network methods by name instead of issuing requests", () => {
		const service = http();
		for (const method of ["GetAsync", "PostAsync", "RequestAsync"]) {
			expect(service[method]).toBeTypeOf("function");
			expect(() => (service[method] as () => unknown)()).toThrow(
				new RegExp(`\\[loom\\] HttpService\\.${method} is not supported`),
			);
		}
	});
});

describe("CollectionService", () => {
	interface Tags {
		AddTag(instance: LoomInstance, tag: string): void;
		RemoveTag(instance: LoomInstance, tag: string): void;
		HasTag(instance: LoomInstance, tag: string): boolean;
		GetTags(instance: LoomInstance): string[];
		GetTagged(tag: string): LoomInstance[];
		GetAllTags(): string[];
		GetInstanceAddedSignal(tag: string): LoomSignal<[LoomInstance]>;
		GetInstanceRemovedSignal(tag: string): LoomSignal<[LoomInstance]>;
	}
	const tags = (): Tags =>
		game.GetService("CollectionService") as unknown as Tags;

	it("adds, reports and removes tags", () => {
		const service = tags();
		const frame = createInstance("Frame");
		expect(service.HasTag(frame, "card")).toBe(false);

		service.AddTag(frame, "card");
		expect(service.HasTag(frame, "card")).toBe(true);
		expect(service.GetTags(frame)).toEqual(["card"]);
		expect(service.GetTagged("card")).toContain(frame);
		expect(service.GetAllTags()).toContain("card");

		service.RemoveTag(frame, "card");
		expect(service.HasTag(frame, "card")).toBe(false);
		expect(service.GetTagged("card")).not.toContain(frame);
	});

	it("returns fresh arrays a caller can mutate safely", () => {
		const service = tags();
		const frame = createInstance("Frame");
		service.AddTag(frame, "fresh");
		const first = service.GetTagged("fresh");
		first.length = 0;
		expect(service.GetTagged("fresh")).toContain(frame);
		service.RemoveTag(frame, "fresh");
	});

	it("fires the added and removed signals once per real change", () => {
		const service = tags();
		const frame = createInstance("Frame");
		const added: LoomInstance[] = [];
		const removed: LoomInstance[] = [];
		service.GetInstanceAddedSignal("signalled").Connect((i) => added.push(i));
		service
			.GetInstanceRemovedSignal("signalled")
			.Connect((i) => removed.push(i));

		service.AddTag(frame, "signalled");
		service.AddTag(frame, "signalled"); // already tagged — no second fire
		expect(added).toEqual([frame]);

		service.RemoveTag(frame, "signalled");
		service.RemoveTag(frame, "signalled");
		expect(removed).toEqual([frame]);
	});
});
