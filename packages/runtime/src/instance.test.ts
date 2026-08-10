import { describe, expect, it, vi } from "vitest";
import { UDim2, Vector2 } from "./datatypes";
import {
	createInstance,
	getInternalId,
	isLoomInstance,
	type LoomInstance,
	setFeedbackProperty,
	updateAbsoluteGeometry,
} from "./instance";
import { getDirtyCount } from "./scheduler";
import type { LoomSignal } from "./signal";

describe("LoomInstance tree", () => {
	it("parents, lists children, and finds descendants", () => {
		const root = createInstance("Frame", "Root");
		const child = createInstance("TextLabel", "Label");
		const grandchild = createInstance("UICorner");
		child.Parent = root;
		grandchild.Parent = child;

		expect(child.Parent).toBe(root);
		expect(root.GetChildren()).toEqual([child]);
		expect(root.GetDescendants()).toEqual([child, grandchild]);
		expect(child.IsDescendantOf(root)).toBe(true);
		expect(grandchild.IsDescendantOf(root)).toBe(true);
		expect(root.IsDescendantOf(child)).toBe(false);
		expect(root.GetFullName()).toBe("Root");
		expect(grandchild.GetFullName()).toBe("Root.Label.UICorner");
	});

	it("GetChildren returns a copy", () => {
		const root = createInstance("Frame");
		createInstance("Frame", "A").Parent = root;
		const snapshot = root.GetChildren();
		snapshot.length = 0;
		expect(root.GetChildren()).toHaveLength(1);
	});

	it("FindFirstChild supports recursive search", () => {
		const root = createInstance("Frame", "Root");
		const inner = createInstance("Frame", "Inner");
		const deep = createInstance("TextButton", "Deep");
		inner.Parent = root;
		deep.Parent = inner;

		expect(root.FindFirstChild("Inner")).toBe(inner);
		expect(root.FindFirstChild("Deep")).toBeUndefined();
		expect(root.FindFirstChild("Deep", true)).toBe(deep);
		expect(root.FindFirstChildOfClass("Frame")).toBe(inner);
		expect(deep.FindFirstAncestor("Root")).toBe(root);
		expect(deep.FindFirstAncestorOfClass("Frame")).toBe(inner);
		expect(deep.FindFirstAncestorWhichIsA("GuiObject")).toBe(inner);
	});

	it("WaitForChild returns synchronously or warns and returns undefined", () => {
		const root = createInstance("Frame", "Root");
		const child = createInstance("Frame", "Child");
		child.Parent = root;
		expect(root.WaitForChild("Child")).toBe(child);

		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		expect(root.WaitForChild("Missing")).toBeUndefined();
		expect(warnSpy).toHaveBeenCalledOnce();
		warnSpy.mockRestore();
	});

	it("reparenting fires ChildRemoved, ChildAdded, and AncestryChanged", () => {
		const a = createInstance("Frame", "A");
		const b = createInstance("Frame", "B");
		const child = createInstance("Frame", "Child");
		child.Parent = a;

		const events: string[] = [];
		a.ChildRemoved.Connect((c) => events.push(`removed:${c.Name}`));
		b.ChildAdded.Connect((c) => events.push(`added:${c.Name}`));
		child.AncestryChanged.Connect((c, parent) =>
			events.push(`ancestry:${c.Name}->${parent?.Name}`),
		);

		child.Parent = b;
		expect(events).toEqual([
			"removed:Child",
			"added:Child",
			"ancestry:Child->B",
		]);
		expect(a.GetChildren()).toEqual([]);
		expect(b.GetChildren()).toEqual([child]);
	});

	it("rejects circular reparenting", () => {
		const parent = createInstance("Frame", "Parent");
		const child = createInstance("Frame", "Child");
		child.Parent = parent;
		expect(() => {
			parent.Parent = child;
		}).toThrow(/circular/);
	});

	it("IsA walks the class chain", () => {
		const button = createInstance("TextButton");
		expect(button.IsA("TextButton")).toBe(true);
		expect(button.IsA("GuiButton")).toBe(true);
		expect(button.IsA("GuiObject")).toBe(true);
		expect(button.IsA("GuiBase2d")).toBe(true);
		expect(button.IsA("Instance")).toBe(true);
		expect(button.IsA("TextBox")).toBe(false);

		const playerGui = createInstance("PlayerGui");
		expect(playerGui.IsA("PlayerGui")).toBe(true);
		expect(playerGui.IsA("BasePlayerGui")).toBe(true);
		expect(playerGui.IsA("Instance")).toBe(true);
	});

	it("GetPropertyChangedSignal fires once per change, not on same-value sets", () => {
		const frame = createInstance("Frame");
		const cb = vi.fn();
		frame.GetPropertyChangedSignal("BackgroundTransparency").Connect(cb);

		frame.BackgroundTransparency = 0.5;
		expect(cb).toHaveBeenCalledTimes(1);
		frame.BackgroundTransparency = 0.5; // same value → no fire
		expect(cb).toHaveBeenCalledTimes(1);
		frame.BackgroundTransparency = 0.75;
		expect(cb).toHaveBeenCalledTimes(2);
	});

	it("Changed fires with the property name", () => {
		const frame = createInstance("Frame");
		const names: string[] = [];
		frame.Changed.Connect((name) => names.push(name));
		frame.Visible = false;
		frame.Name = "Renamed";
		expect(names).toEqual(["Visible", "Name"]);
		expect(frame.Name).toBe("Renamed");
	});

	it("Destroy fires Destroying, detaches, and disconnects signals", () => {
		const root = createInstance("Frame", "Root");
		const child = createInstance("Frame", "Child");
		const grandchild = createInstance("Frame", "Grandchild");
		child.Parent = root;
		grandchild.Parent = child;

		const destroying = vi.fn();
		child.Destroying.Connect(destroying);
		const propConnection = child
			.GetPropertyChangedSignal("Visible")
			.Connect(() => {});
		const grandchildDestroying = vi.fn();
		grandchild.Destroying.Connect(grandchildDestroying);
		const removed = vi.fn();
		root.ChildRemoved.Connect(removed);

		child.Destroy();
		expect(destroying).toHaveBeenCalledOnce();
		expect(grandchildDestroying).toHaveBeenCalledOnce();
		expect(removed).toHaveBeenCalledOnce();
		expect(child.Parent).toBeUndefined();
		expect(root.GetChildren()).toEqual([]);
		expect(propConnection.Connected).toBe(false);
	});

	it("ClearAllChildren destroys every child", () => {
		const root = createInstance("Frame");
		createInstance("Frame", "A").Parent = root;
		createInstance("Frame", "B").Parent = root;
		root.ClearAllChildren();
		expect(root.GetChildren()).toEqual([]);
	});

	it("stores arbitrary properties and exposes identity helpers", () => {
		const frame = createInstance("Frame");
		frame.Text = "hello";
		expect(frame.Text).toBe("hello");
		expect(isLoomInstance(frame)).toBe(true);
		expect(isLoomInstance({})).toBe(false);
		expect(getInternalId(frame)).toMatch(/^i\d+$/);
		expect(String(frame)).toBe("Frame");
	});

	it("updateAbsoluteGeometry fires prop signals only on change", () => {
		const frame = createInstance("Frame");
		const positionCb = vi.fn();
		const sizeCb = vi.fn();
		frame.GetPropertyChangedSignal("AbsolutePosition").Connect(positionCb);
		frame.GetPropertyChangedSignal("AbsoluteSize").Connect(sizeCb);

		updateAbsoluteGeometry(frame, Vector2.new(10, 20), Vector2.new(100, 50));
		expect(positionCb).toHaveBeenCalledTimes(1);
		expect(sizeCb).toHaveBeenCalledTimes(1);
		expect(frame.AbsolutePosition).toEqual(Vector2.new(10, 20));
		expect(frame.AbsoluteSize).toEqual(Vector2.new(100, 50));

		// Same values (fresh objects) → no additional fires.
		updateAbsoluteGeometry(frame, Vector2.new(10, 20), Vector2.new(100, 50));
		expect(positionCb).toHaveBeenCalledTimes(1);
		expect(sizeCb).toHaveBeenCalledTimes(1);

		// Only the position changes → only its signal fires.
		updateAbsoluteGeometry(frame, Vector2.new(15, 20), Vector2.new(100, 50));
		expect(positionCb).toHaveBeenCalledTimes(2);
		expect(sizeCb).toHaveBeenCalledTimes(1);
	});

	it("exposes event signals lazily and stably", () => {
		const button = createInstance("TextButton");
		const activated = button.Activated as LoomSignal<unknown[]>;
		expect(button.Activated).toBe(activated);
		const seen = vi.fn();
		activated.Connect(seen);
		activated.fire();
		expect(seen).toHaveBeenCalledOnce();
	});

	it("warns (once) and no-ops TextBox focus methods without an adapter", () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		const box = createInstance("TextBox");
		const captureFocus = box.CaptureFocus as () => void;
		const isFocused = box.IsFocused as () => boolean;
		expect(captureFocus()).toBeUndefined();
		expect(isFocused()).toBe(false);
		warnSpy.mockRestore();
	});
});

describe("LoomInstance types", () => {
	it("keeps LoomInstance assignable through the tree API", () => {
		const frame: LoomInstance = createInstance("Frame");
		const found: LoomInstance | undefined = frame.FindFirstChild("x");
		expect(found).toBeUndefined();
	});
});

describe("class read defaults and feedback writes", () => {
	it("defaults Rotation/GroupTransparency/scroll metrics reads by class", () => {
		const frame = createInstance("Frame");
		expect(frame.Rotation).toBe(0); // Spinner does `Rotation += d` on first frame
		expect(frame.CanvasPosition).toBeUndefined(); // not a ScrollingFrame

		const scroll = createInstance("ScrollingFrame");
		expect(scroll.CanvasPosition).toBe(Vector2.zero);
		expect(scroll.AbsoluteWindowSize).toBe(Vector2.zero);
		expect(scroll.AbsoluteCanvasSize).toBe(Vector2.zero);

		const group = createInstance("CanvasGroup");
		expect(group.GroupTransparency).toBe(0);
		expect(frame.GroupTransparency).toBeUndefined();
	});

	it("setFeedbackProperty fires signals only on real change and never marks dirty", () => {
		const scroll = createInstance("ScrollingFrame");
		let fires = 0;
		scroll.GetPropertyChangedSignal("AbsoluteCanvasSize").Connect(() => {
			fires += 1;
		});
		const dirtyBefore = getDirtyCount();

		// Equal to the class read default (Vector2.zero): complete no-op.
		setFeedbackProperty(scroll, "AbsoluteCanvasSize", Vector2.new(0, 0));
		expect(fires).toBe(0);

		setFeedbackProperty(scroll, "AbsoluteCanvasSize", Vector2.new(100, 300));
		expect(fires).toBe(1);
		expect((scroll.AbsoluteCanvasSize as Vector2).Y).toBe(300);

		// Same components in a fresh Vector2: change-gated, no re-fire.
		setFeedbackProperty(scroll, "AbsoluteCanvasSize", Vector2.new(100, 300));
		expect(fires).toBe(1);

		// Feedback writes never enter the dirty set (no flush loop).
		expect(getDirtyCount()).toBe(dirtyBefore);
	});
});

describe("BindableEvent", () => {
	// The one Roblox signal an app owns rather than one the engine raises.
	// roblox-ts UI code keeps one in a ref (`useRef(new Instance("BindableEvent"))`)
	// so a label can tell an unrelated input it was clicked — without `.Event`
	// the consumer dies on "Cannot read properties of undefined (reading 'Connect')".
	it("connects and fires with arguments", () => {
		const bindable = createInstance("BindableEvent");
		const seen: unknown[][] = [];
		const connection = (
			bindable.Event as unknown as LoomSignal<unknown[]>
		).Connect((...args: unknown[]) => seen.push(args));

		(bindable.Fire as (...args: unknown[]) => void)("a", 1);
		expect(seen).toEqual([["a", 1]]);

		connection.Disconnect();
		(bindable.Fire as (...args: unknown[]) => void)("b");
		expect(seen).toEqual([["a", 1]]);
	});

	it("hands the same signal back on every read", () => {
		const bindable = createInstance("BindableEvent");
		expect(bindable.Event).toBe(bindable.Event);
	});

	it("keeps `Event` and `Fire` off unrelated classes", () => {
		// Both are ordinary enough words that answering for them everywhere would
		// shadow a real property — a Frame's `Event` is whatever the app stored.
		const frame = createInstance("Frame");
		expect(frame.Event).toBeUndefined();
		expect(frame.Fire).toBeUndefined();
	});
});

describe("GuiObject read defaults", () => {
	// Roblox reflection always yields a typed value. The props store starts
	// empty, so a property nobody wrote used to read `undefined` — and app code
	// that branches on it silently took the wrong path. A drag's droppable hit
	// test filters on `descendant.Visible`, so every candidate was treated as
	// hidden and nothing was ever droppable.
	it("reports the Roblox defaults before anything is written", () => {
		const frame = createInstance("Frame");
		expect(frame.Visible).toBe(true);
		expect(frame.ZIndex).toBe(1);
		expect(frame.BackgroundTransparency).toBe(0);
		expect(frame.Rotation).toBe(0);
		expect(frame.LayoutOrder).toBe(0);
		expect(frame.Active).toBe(false);
		expect(frame.ClipsDescendants).toBe(false);
		expect(frame.AnchorPoint).toEqual(new Vector2(0, 0));
		expect(frame.Position).toEqual(new UDim2());
		expect(frame.Size).toEqual(new UDim2());
	});

	it("hands out a fresh datatype per read", () => {
		// A shared instance would let one caller's mutation leak into every other
		// node that never set the property.
		const frame = createInstance("Frame");
		expect(frame.Position).not.toBe(frame.Position);
		expect(frame.Position).toEqual(frame.Position);
	});

	it("is overridden by a written value, and reverts when cleared", () => {
		const frame = createInstance("Frame");
		frame.Visible = false;
		expect(frame.Visible).toBe(false);
		frame.Visible = undefined;
		expect(frame.Visible).toBe(true);
	});

	it("stays off classes that have no such property", () => {
		// A UIListLayout has no `Visible`; answering for it would invent reflection
		// the engine does not have.
		expect(createInstance("UIListLayout").Visible).toBeUndefined();
		expect(createInstance("Folder").ZIndex).toBeUndefined();
	});
});

describe("attributes", () => {
	// Roblox's second namespace on every instance, and the one an app owns
	// outright: nothing the engine writes, nothing the renderer paints. Vela's
	// runtime reads `LocalPlayer:GetAttribute("VelaColorScheme")` on every
	// environment read to resolve `dark:`, so without these a scene that reaches
	// its runtime host dies on `GetAttribute is not a function` before it draws.
	it("reads back what was set, and reports nothing for an unset name", () => {
		const frame = createInstance("Frame");
		expect(frame.GetAttribute("Theme")).toBeUndefined();

		frame.SetAttribute("Theme", "dark");
		expect(frame.GetAttribute("Theme")).toBe("dark");
	});

	it("removes an attribute when the value is nil", () => {
		// Roblox spells "unset" as `SetAttribute(name, nil)` — there is no
		// separate remove call, and the removal still notifies.
		const frame = createInstance("Frame");
		frame.SetAttribute("Theme", "dark");

		const seen: string[] = [];
		(frame.AttributeChanged as LoomSignal<[string]>).Connect((name) =>
			seen.push(name),
		);

		frame.SetAttribute("Theme", undefined);
		expect(frame.GetAttribute("Theme")).toBeUndefined();
		expect(frame.GetAttributes().has("Theme")).toBe(false);
		expect(seen).toEqual(["Theme"]);
	});

	it("fires the per-attribute signal and AttributeChanged, once per change", () => {
		const frame = createInstance("Frame");
		const perName: number[] = [];
		const anyName: string[] = [];
		frame.GetAttributeChangedSignal("Theme").Connect(() => perName.push(1));
		(frame.AttributeChanged as LoomSignal<[string]>).Connect((name) =>
			anyName.push(name),
		);

		frame.SetAttribute("Theme", "dark");
		frame.SetAttribute("Theme", "dark"); // unchanged — silent, as in Roblox
		frame.SetAttribute("Theme", "light");
		frame.SetAttribute("Other", 1);

		expect(perName).toHaveLength(2);
		expect(anyName).toEqual(["Theme", "Theme", "Other"]);
	});

	it("hands the same per-attribute signal back on every read", () => {
		const frame = createInstance("Frame");
		expect(frame.GetAttributeChangedSignal("Theme")).toBe(
			frame.GetAttributeChangedSignal("Theme"),
		);
	});

	it("GetAttributes returns a snapshot, not the live store", () => {
		const frame = createInstance("Frame");
		frame.SetAttribute("A", 1);
		const snapshot = frame.GetAttributes();
		snapshot.clear();
		expect(frame.GetAttributes().get("A")).toBe(1);
	});

	it("keeps attributes out of the property namespace", () => {
		// The two are separate in Roblox: an attribute is not readable as a
		// property, does not fire `Changed`, and never reaches the renderer.
		const frame = createInstance("Frame");
		const changed: unknown[] = [];
		(frame.Changed as LoomSignal<[string]>).Connect((key) => changed.push(key));

		frame.SetAttribute("Theme", "dark");

		expect(frame.Theme).toBeUndefined();
		expect(changed).toEqual([]);
	});

	it("rejects a name Roblox would reject", () => {
		const frame = createInstance("Frame");
		expect(() => frame.SetAttribute("has space", 1)).toThrow(/invalid/);
		expect(() => frame.SetAttribute("kebab-case", 1)).toThrow(/invalid/);
		expect(() => frame.SetAttribute("", 1)).toThrow(/invalid/);
		expect(() => frame.SetAttribute("a".repeat(101), 1)).toThrow(/invalid/);
		expect(() => frame.SetAttribute("RBXInternal", 1)).toThrow(/reserved/);
	});

	it("is per instance", () => {
		const a = createInstance("Frame");
		const b = createInstance("Frame");
		a.SetAttribute("Theme", "dark");
		expect(b.GetAttribute("Theme")).toBeUndefined();
	});

	it("does not mark the instance dirty", () => {
		// Attributes paint nothing, so a write should not schedule a flush.
		const frame = createInstance("Frame");
		frame.Parent = createInstance("Frame");
		const before = getDirtyCount();
		frame.SetAttribute("Theme", "dark");
		expect(getDirtyCount()).toBe(before);
	});
});
