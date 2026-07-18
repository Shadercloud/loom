/**
 * World pipeline: React commits mutate LoomInstances and flush through
 * encode → (stubbed) layout → DOM session; element identity survives commits;
 * direct property writes flush without React; layout feedback fires the
 * Absolute* signals exactly once per actual change; `Event` handlers receive
 * Roblox `(rbx, ...args)` calling convention from delegated pointer input.
 */
import type { InputObject, LoomInstance } from "@loom-dev/runtime";
import { Color3, Enum, flushDirtyNow, UDim2 } from "@loom-dev/runtime";
import type { LayoutResult, SceneNode, Viewport } from "@loom-dev/scene";
import { createElement, type ReactElement, useState } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type ComputeLayout, type MountedWorld, mountSync } from "./index";

/** Stub layout: every node gets x=0, y=0 and the (mutable) shared size. */
function makeStubLayout(size: {
	width: number;
	height: number;
}): ComputeLayout {
	return (root: SceneNode, _viewport: Viewport): LayoutResult => {
		const rects: LayoutResult["rects"] = {};
		const walk = (node: SceneNode): void => {
			rects[node.id ?? "?"] = {
				rect: { x: 0, y: 0, width: size.width, height: size.height },
			};
			for (const child of node.children ?? []) walk(child);
		};
		walk(root);
		return { rects };
	};
}

function makeMount(): HTMLElement {
	const mount = document.createElement("div");
	// happy-dom reports 0 for client sizes; the world skips zero-sized mounts.
	Object.defineProperty(mount, "clientWidth", { value: 800 });
	Object.defineProperty(mount, "clientHeight", { value: 600 });
	document.body.appendChild(mount);
	return mount;
}

const PointerEventCtor: typeof MouseEvent =
	(globalThis as { PointerEvent?: typeof MouseEvent }).PointerEvent ??
	MouseEvent;

describe("mountSync world", () => {
	let mount: HTMLElement;
	let roots: MountedWorld[];

	beforeEach(() => {
		document.body.innerHTML = "";
		mount = makeMount();
		roots = [];
	});
	afterEach(() => {
		for (const root of roots) root.unmount();
	});

	function mountWith(
		element: ReactElement,
		size = { width: 100, height: 50 },
	): MountedWorld {
		const root = mountSync(element, mount, {
			computeLayout: makeStubLayout(size),
		});
		roots.push(root);
		return root;
	}

	it("renders a tree into session DOM", () => {
		mountWith(
			createElement(
				"screengui",
				{ Name: "Gui" },
				createElement(
					"frame",
					{ Name: "Card", BackgroundColor3: Color3.fromRGB(255, 0, 0) },
					createElement("textlabel", { Name: "Label", Text: "hi" }),
				),
			),
		);
		const card = mount.querySelector('[data-loom-name="Card"]') as HTMLElement;
		expect(card).not.toBeNull();
		expect(card.style.width).toBe("100px");
		expect(card.getAttribute("style")).toContain("255, 0, 0");
		const label = mount.querySelector('[data-loom-name="Label"]');
		expect(label?.textContent).toBe("hi");
	});

	it("preserves element identity across setState commits", () => {
		let setColor: ((c: unknown) => void) | undefined;
		function App(): ReactElement {
			const [color, set] = useState<unknown>(Color3.fromRGB(255, 0, 0));
			setColor = set;
			return createElement(
				"screengui",
				{ Name: "Gui" },
				createElement("frame", { Name: "Box", BackgroundColor3: color }),
			);
		}
		mountWith(createElement(App));
		const el = mount.querySelector('[data-loom-name="Box"]') as HTMLElement;
		expect(el.getAttribute("style")).toContain("255, 0, 0");

		setColor?.(Color3.fromRGB(0, 255, 0));

		const after = mount.querySelector('[data-loom-name="Box"]') as HTMLElement;
		expect(after).toBe(el); // patched in place — listeners/focus survive
		expect(after.getAttribute("style")).toContain("0, 255, 0");
	});

	it("flushes direct ref writes without a React commit", () => {
		let renders = 0;
		let instance: LoomInstance | undefined;
		function App(): ReactElement {
			renders += 1;
			return createElement(
				"screengui",
				{ Name: "Gui" },
				createElement("frame", {
					Name: "Motion",
					ref: (inst: LoomInstance | null) => {
						if (inst) instance = inst;
					},
				}),
			);
		}
		mountWith(createElement(App));
		const el = mount.querySelector('[data-loom-name="Motion"]') as HTMLElement;
		const rendersAfterMount = renders;

		expect(instance).toBeDefined();
		const inst = instance as LoomInstance;
		inst.BackgroundColor3 = Color3.fromRGB(9, 8, 7);
		inst.Position = UDim2.fromOffset(3, 4);
		flushDirtyNow();

		expect(renders).toBe(rendersAfterMount); // no React commit happened
		expect(el.getAttribute("style")).toContain("9, 8, 7");
	});

	it("fires the AbsoluteSize signal exactly once per actual change", () => {
		const size = { width: 100, height: 50 };
		let instance: LoomInstance | undefined;
		mountWith(
			createElement("frame", {
				Name: "Tracked",
				ref: (inst: LoomInstance | null) => {
					if (inst) instance = inst;
				},
			}),
			size,
		);
		expect(instance).toBeDefined();
		const inst = instance as LoomInstance;

		let fires = 0;
		inst.GetPropertyChangedSignal("AbsoluteSize").Connect(() => {
			fires += 1;
		});

		// Unchanged geometry: a re-flush must not re-fire the signal.
		inst.ZIndex = 2;
		flushDirtyNow();
		expect(fires).toBe(0);

		// Grow the stubbed layout: exactly one fire.
		size.width = 150;
		inst.ZIndex = 3;
		flushDirtyNow();
		expect(fires).toBe(1);
		expect((inst.AbsoluteSize as { X: number }).X).toBe(150);

		// And stable again afterwards.
		inst.ZIndex = 4;
		flushDirtyNow();
		expect(fires).toBe(1);
	});

	it("delivers Event handlers with (rbx, ...args) from pointer input", () => {
		const calls: unknown[][] = [];
		let instance: LoomInstance | undefined;
		mountWith(
			createElement("textbutton", {
				Name: "Button",
				ref: (inst: LoomInstance | null) => {
					if (inst) instance = inst;
				},
				Event: {
					Activated: (...args: unknown[]) => calls.push(["Activated", ...args]),
					InputBegan: (...args: unknown[]) =>
						calls.push(["InputBegan", ...args]),
				},
			}),
		);
		const el = mount.querySelector('[data-loom-name="Button"]') as Element;
		el.dispatchEvent(
			new PointerEventCtor("pointerdown", {
				bubbles: true,
				clientX: 10,
				clientY: 20,
			}),
		);
		el.dispatchEvent(
			new PointerEventCtor("pointerup", {
				bubbles: true,
				clientX: 10,
				clientY: 20,
			}),
		);

		expect(calls.map((c) => c[0])).toEqual(["InputBegan", "Activated"]);
		const began = calls[0] as unknown[];
		expect(began[1]).toBe(instance); // rbx first
		expect((began[2] as InputObject).UserInputType).toBe(
			Enum.UserInputType.MouseButton1,
		);
		const activated = calls[1] as unknown[];
		expect(activated[1]).toBe(instance);
		expect((activated[2] as InputObject).Position.Y).toBe(20);
		expect(activated[3]).toBe(1); // clickCount
	});

	/** Layout stub keyed by node name (hit-testing needs distinct rects). */
	function makeNamedLayout(
		rects: Record<
			string,
			{ x: number; y: number; width: number; height: number }
		>,
	): ComputeLayout {
		return (root: SceneNode): LayoutResult => {
			const out: LayoutResult["rects"] = {};
			const walk = (node: SceneNode): void => {
				out[node.id ?? "?"] = {
					rect: rects[node.name] ?? { x: 0, y: 0, width: 800, height: 600 },
				};
				for (const child of node.children ?? []) walk(child);
			};
			walk(root);
			return { rects: out };
		};
	}

	it("hit-tests GetGuiObjectsAtPosition topmost-first (ZIndex, then depth)", () => {
		const root = mountSync(
			createElement(
				"screengui",
				{ Name: "Gui" },
				createElement("frame", { Name: "Low", ZIndex: 1 }),
				createElement(
					"frame",
					{ Name: "High", ZIndex: 3 },
					createElement("frame", { Name: "Child", ZIndex: 3 }),
				),
				createElement("frame", { Name: "Hidden", Visible: false, ZIndex: 9 }),
			),
			mount,
			{
				computeLayout: makeNamedLayout({
					Gui: { x: 0, y: 0, width: 800, height: 600 },
					Low: { x: 0, y: 0, width: 100, height: 100 },
					High: { x: 50, y: 0, width: 100, height: 100 },
					Child: { x: 60, y: 0, width: 20, height: 20 },
					Hidden: { x: 0, y: 0, width: 200, height: 200 },
				}),
			},
		);
		roots.push(root);

		// The world root is PlayerGui-classed: the service method resolves on it.
		const playerGui = root.world.rootInstance;
		const atPosition = playerGui.GetGuiObjectsAtPosition as (
			x: number,
			y: number,
		) => LoomInstance[];

		// Overlap of all three (65, 5): equal ZIndex breaks by depth (Child on
		// top of High), Hidden excluded (Visible false), ScreenGui excluded
		// (not a GuiObject).
		expect(atPosition(65, 5).map((inst) => inst.Name)).toEqual([
			"Child",
			"High",
			"Low",
		]);
		// Only Low contains (10, 60).
		expect(atPosition(10, 60).map((inst) => inst.Name)).toEqual(["Low"]);
		// Outside everything.
		expect(atPosition(700, 500)).toEqual([]);
	});

	it("feeds ScrollingFrame metrics back after flush, change-gated", () => {
		const rects: Record<
			string,
			{ x: number; y: number; width: number; height: number }
		> = {
			Gui: { x: 0, y: 0, width: 800, height: 600 },
			Scroll: { x: 10, y: 10, width: 100, height: 100 },
			// Laid-out child extends 300px below the frame's origin.
			Content: { x: 10, y: 10, width: 100, height: 300 },
		};
		let instance: LoomInstance | undefined;
		const root = mountSync(
			createElement(
				"screengui",
				{ Name: "Gui" },
				createElement(
					"scrollingframe",
					{
						Name: "Scroll",
						AutomaticCanvasSize: Enum.AutomaticSize.XY,
						CanvasSize: UDim2.fromScale(0, 0),
						ref: (inst: LoomInstance | null) => {
							if (inst) instance = inst;
						},
					},
					createElement("frame", { Name: "Content" }),
				),
			),
			mount,
			{ computeLayout: makeNamedLayout(rects) },
		);
		roots.push(root);
		expect(instance).toBeDefined();
		const inst = instance as LoomInstance;

		// CanvasPosition reads as a real Vector2 before any write (lattice's
		// viewport effect dereferences `.Y` immediately on mount).
		expect((inst.CanvasPosition as { X: number; Y: number }).X).toBe(0);
		expect((inst.CanvasPosition as { X: number; Y: number }).Y).toBe(0);
		// Window = the frame's own rect; canvas = children bounding box (the
		// resolved CanvasSize is zero and AutomaticCanvasSize is XY).
		expect((inst.AbsoluteWindowSize as { X: number }).X).toBe(100);
		expect((inst.AbsoluteWindowSize as { Y: number }).Y).toBe(100);
		expect((inst.AbsoluteCanvasSize as { X: number }).X).toBe(100);
		expect((inst.AbsoluteCanvasSize as { Y: number }).Y).toBe(300);

		let fires = 0;
		inst.GetPropertyChangedSignal("AbsoluteCanvasSize").Connect(() => {
			fires += 1;
		});

		// Unchanged metrics: a re-flush must not re-fire the signal.
		inst.ZIndex = 2;
		flushDirtyNow();
		expect(fires).toBe(0);

		// Content grows: exactly one fire with the new extent.
		rects.Content = { x: 10, y: 10, width: 100, height: 400 };
		inst.ZIndex = 3;
		flushDirtyNow();
		expect(fires).toBe(1);
		expect((inst.AbsoluteCanvasSize as { Y: number }).Y).toBe(400);

		// And stable again afterwards.
		inst.ZIndex = 4;
		flushDirtyNow();
		expect(fires).toBe(1);
	});
});
