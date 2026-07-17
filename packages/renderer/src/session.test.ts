/**
 * DomSession behavior: keyed incremental patching (element identity across
 * patches, stale-node removal, renderScene parity) and delegated pointer input
 * dispatch onto live LoomInstances.
 */
import type { InputObject, LoomInstance } from "@loom-dev/runtime";
import {
	createInstance,
	Enum,
	getEventSignal,
	getInternalId,
} from "@loom-dev/runtime";
import type { LayoutResult, Rect, SceneNode } from "@loom-dev/scene";
import { color3FromRGB, prop, udim2 } from "@loom-dev/scene";
import { beforeEach, describe, expect, it } from "vitest";
import { createDomSession, type DomSession, renderScene } from "./index";

function layoutOf(entries: Record<string, Rect>): LayoutResult {
	const rects: LayoutResult["rects"] = {};
	for (const [id, rect] of Object.entries(entries)) rects[id] = { rect };
	return { rects };
}

/** Attribute the session adds but renderScene doesn't; strip for parity diffs. */
function withoutIds(html: string): string {
	return html.replace(/ data-loom-id="[^"]*"/g, "");
}

// happy-dom ships PointerEvent; fall back to MouseEvent defensively.
const PointerEventCtor: typeof MouseEvent =
	(globalThis as { PointerEvent?: typeof MouseEvent }).PointerEvent ??
	MouseEvent;

function firePointer(
	target: Element,
	type: string,
	init: MouseEventInit = {},
): void {
	target.dispatchEvent(new PointerEventCtor(type, { bubbles: true, ...init }));
}

describe("createDomSession", () => {
	let mount: HTMLElement;

	beforeEach(() => {
		document.body.innerHTML = "";
		mount = document.createElement("div");
		document.body.appendChild(mount);
	});

	function makeSession(byId: Map<string, LoomInstance>): DomSession {
		return createDomSession(mount, {
			resolveInstance: (id) => byId.get(id),
		});
	}

	it("produces the same DOM as renderScene for the same scene", () => {
		const scene: SceneNode = {
			className: "Frame",
			name: "Card",
			id: "root",
			properties: {
				BackgroundColor3: prop.color3(color3FromRGB(28, 32, 38)),
				ZIndex: prop.int(2),
			},
			children: [
				{
					className: "UICorner",
					name: "UICorner",
					properties: { CornerRadius: prop.udim({ scale: 0, offset: 8 }) },
				},
				{
					className: "TextLabel",
					name: "Label",
					id: "label",
					properties: {
						Text: prop.string("hello"),
						TextSize: prop.number(18),
						Size: prop.udim2(udim2(1, 0, 0, 24)),
					},
				},
			],
		};
		const layout = layoutOf({
			root: { x: 10, y: 20, width: 200, height: 100 },
			label: { x: 20, y: 30, width: 180, height: 24 },
		});

		const reference = document.createElement("div");
		renderScene(scene, layout, reference);

		const session = makeSession(new Map());
		session.patch(scene, layout);

		expect(withoutIds(mount.innerHTML)).toBe(reference.innerHTML);
		session.dispose();
	});

	it("updates styles in place without recreating elements", () => {
		// The box must not be the scene root: roots are transparent containers.
		const makeScene = (color: {
			r: number;
			g: number;
			b: number;
		}): SceneNode => ({
			className: "ScreenGui",
			name: "Gui",
			id: "gui",
			children: [
				{
					className: "Frame",
					name: "Box",
					id: "box",
					properties: { BackgroundColor3: prop.color3(color) },
				},
			],
		});
		const layout = layoutOf({
			gui: { x: 0, y: 0, width: 200, height: 100 },
			box: { x: 0, y: 0, width: 100, height: 50 },
		});

		const session = makeSession(new Map());
		session.patch(makeScene({ r: 1, g: 0, b: 0 }), layout);
		const el = mount.querySelector('[data-loom-id="box"]') as HTMLElement;
		expect(el).not.toBeNull();
		expect(el.getAttribute("style")).toContain("255, 0, 0");

		session.patch(makeScene({ r: 0, g: 1, b: 0 }), layout);
		const after = mount.querySelector('[data-loom-id="box"]') as HTMLElement;
		expect(after).toBe(el); // same element, patched in place
		expect(after.getAttribute("style")).toContain("0, 255, 0");
		session.dispose();
	});

	it("removes elements for nodes that left the scene", () => {
		const child: SceneNode = { className: "Frame", name: "Child", id: "child" };
		const root = (children: SceneNode[]): SceneNode => ({
			className: "Frame",
			name: "Root",
			id: "root",
			children,
		});
		const layout = layoutOf({
			root: { x: 0, y: 0, width: 100, height: 50 },
			child: { x: 0, y: 0, width: 10, height: 10 },
		});

		const session = makeSession(new Map());
		session.patch(root([child]), layout);
		expect(mount.querySelector('[data-loom-id="child"]')).not.toBeNull();

		session.patch(root([]), layout);
		expect(mount.querySelector('[data-loom-id="child"]')).toBeNull();
		expect(mount.querySelector('[data-loom-id="root"]')).not.toBeNull();
		session.dispose();
	});

	it("dispatches InputBegan → InputEnded → Activated on pointer click", () => {
		const button = createInstance("TextButton", "Button");
		const buttonId = getInternalId(button);
		const byId = new Map([[buttonId, button]]);
		const scene: SceneNode = {
			className: "TextButton",
			name: "Button",
			id: buttonId,
		};
		const layout = layoutOf({
			[buttonId]: { x: 0, y: 0, width: 100, height: 40 },
		});

		const session = makeSession(byId);
		session.patch(scene, layout);
		const el = mount.querySelector(`[data-loom-id="${buttonId}"]`) as Element;

		const order: string[] = [];
		const activatedArgs: unknown[][] = [];
		getEventSignal(button, "InputBegan").Connect((input) => {
			order.push("InputBegan");
			expect((input as InputObject).UserInputState).toBe(
				Enum.UserInputState.Begin,
			);
		});
		getEventSignal(button, "InputEnded").Connect(() => {
			order.push("InputEnded");
		});
		getEventSignal(button, "Activated").Connect((...args) => {
			order.push("Activated");
			activatedArgs.push(args);
		});
		getEventSignal(button, "MouseButton1Click").Connect(() => {
			order.push("MouseButton1Click");
		});

		firePointer(el, "pointerdown", { clientX: 12, clientY: 8 });
		firePointer(el, "pointerup", { clientX: 12, clientY: 8 });

		expect(order).toEqual([
			"InputBegan",
			"InputEnded",
			"Activated",
			"MouseButton1Click",
		]);
		// Signal args are (inputObject, clickCount) — the react adapter prepends
		// the instance for `Event` handlers.
		const [input, clickCount] = activatedArgs[0] ?? [];
		expect((input as InputObject).UserInputType).toBe(
			Enum.UserInputType.MouseButton1,
		);
		expect((input as InputObject).Position.X).toBe(12);
		expect(clickCount).toBe(1);
		session.dispose();
	});

	it("fires MouseEnter/MouseLeave with (x, y) via hover chain diff", () => {
		const frame = createInstance("Frame", "Hover");
		const frameId = getInternalId(frame);
		const byId = new Map([[frameId, frame]]);
		const scene: SceneNode = { className: "Frame", name: "Hover", id: frameId };
		const layout = layoutOf({
			[frameId]: { x: 0, y: 0, width: 100, height: 40 },
		});

		const session = makeSession(byId);
		session.patch(scene, layout);
		const el = mount.querySelector(`[data-loom-id="${frameId}"]`) as Element;

		const events: unknown[][] = [];
		getEventSignal(frame, "MouseEnter").Connect((...args) =>
			events.push(["enter", ...args]),
		);
		getEventSignal(frame, "MouseLeave").Connect((...args) =>
			events.push(["leave", ...args]),
		);

		firePointer(el, "pointerover", { clientX: 5, clientY: 6 });
		firePointer(el, "pointerout", { clientX: 7, clientY: 8 });

		expect(events).toEqual([
			["enter", 5, 6],
			["leave", 7, 8],
		]);
		session.dispose();
	});
});
