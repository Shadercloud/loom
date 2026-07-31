/**
 * Bindings: the value primitive itself, and the part that matters most — a
 * bound prop reaching the live instance without a React render, and letting go
 * of its subscription when the prop changes or the element unmounts.
 */
import { flushDirtyNow, type LoomInstance, UDim2 } from "@loom-dev/runtime";
import type { LayoutResult, SceneNode, Viewport } from "@loom-dev/scene";
import { createElement, type ReactElement, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	type Binding,
	createBinding,
	isBinding,
	joinBindings,
} from "./binding.ts";
import { type ComputeLayout, type MountedWorld, mountSync } from "./index.ts";

describe("createBinding", () => {
	it("reads back the initial value and every update", () => {
		const [binding, update] = createBinding(1);
		expect(binding.getValue()).toBe(1);
		update(7);
		expect(binding.getValue()).toBe(7);
	});

	it("notifies subscribers until they unsubscribe", () => {
		const [binding, update] = createBinding("a");
		const seen: string[] = [];
		const unsubscribe = binding.subscribe((value) => seen.push(value));
		update("b");
		update("c");
		unsubscribe();
		update("d");
		expect(seen).toEqual(["b", "c"]);
	});

	it("survives a listener unsubscribing mid-notify", () => {
		const [binding, update] = createBinding(0);
		const second = vi.fn();
		const unsubscribeSecond = binding.subscribe(second);
		binding.subscribe(() => unsubscribeSecond());
		update(1);
		// The self-removing listener ran first in insertion order; the snapshot
		// must not let its removal skip — or double-run — the other one.
		expect(second).toHaveBeenCalledTimes(1);
		update(2);
		expect(second).toHaveBeenCalledTimes(1);
	});

	it("is recognized by isBinding, and plain values are not", () => {
		const [binding] = createBinding(0);
		expect(isBinding(binding)).toBe(true);
		expect(isBinding(binding.map(String))).toBe(true);
		for (const value of [0, "x", null, undefined, {}, { getValue: () => 1 }]) {
			expect(isBinding(value)).toBe(false);
		}
	});
});

describe("binding.map", () => {
	it("derives a value lazily and tracks the source", () => {
		const [binding, update] = createBinding(2);
		const mapper = vi.fn((value: number) => value * 10);
		const mapped = binding.map(mapper);
		// Nothing is computed until something reads or listens.
		expect(mapper).not.toHaveBeenCalled();
		expect(mapped.getValue()).toBe(20);

		const seen: number[] = [];
		mapped.subscribe((value) => seen.push(value));
		update(3);
		expect(seen).toEqual([30]);
	});

	it("chains", () => {
		const [binding, update] = createBinding(1);
		const chained = binding.map((n) => n + 1).map((n) => `#${n}`);
		expect(chained.getValue()).toBe("#2");
		update(9);
		expect(chained.getValue()).toBe("#10");
	});
});

describe("joinBindings", () => {
	it("joins an array and fires on any source change", () => {
		const [a, setA] = createBinding(1);
		const [b, setB] = createBinding(2);
		const joined = joinBindings([a, b]);
		expect(joined.getValue()).toEqual([1, 2]);

		const seen: number[][] = [];
		const unsubscribe = joined.subscribe((value) => seen.push(value));
		setA(10);
		setB(20);
		expect(seen).toEqual([
			[10, 2],
			[10, 20],
		]);
		unsubscribe();
		setA(99);
		expect(seen).toHaveLength(2);
	});

	it("joins a record", () => {
		const [a, setA] = createBinding(1);
		const [b] = createBinding(2);
		const joined = joinBindings({ a, b });
		expect(joined.getValue()).toEqual({ a: 1, b: 2 });
		setA(5);
		expect(joined.getValue()).toEqual({ a: 5, b: 2 });
	});
});

// --- renderer integration ------------------------------------------------------

/** Stub layout: every node gets the same rect, so no WASM is involved. */
const stubLayout: ComputeLayout = (root: SceneNode, _viewport: Viewport) => {
	const rects: LayoutResult["rects"] = {};
	const walk = (node: SceneNode): void => {
		rects[node.id ?? "?"] = { rect: { x: 0, y: 0, width: 800, height: 600 } };
		for (const child of node.children ?? []) walk(child);
	};
	walk(root);
	return { rects };
};

function makeMount(): HTMLElement {
	const mount = document.createElement("div");
	// happy-dom reports 0 for client sizes; the world skips zero-sized mounts.
	Object.defineProperty(mount, "clientWidth", { value: 800 });
	Object.defineProperty(mount, "clientHeight", { value: 600 });
	document.body.appendChild(mount);
	return mount;
}

let mounted: MountedWorld | undefined;

function mount(element: ReactElement): MountedWorld {
	mounted = mountSync(element, makeMount(), { computeLayout: stubLayout });
	return mounted;
}

/** The single frame under this world's default ScreenGui. */
function frameOf(world: MountedWorld): LoomInstance {
	const gui = world.world.defaultGui;
	const frame = gui.GetChildren()[0];
	if (!frame) throw new Error("no frame mounted");
	return frame;
}

afterEach(() => {
	mounted?.unmount();
	mounted = undefined;
	document.body.innerHTML = "";
});

describe("bound props", () => {
	it("applies the current value on mount and every later one without a render", () => {
		const [size, setSize] = createBinding(UDim2.fromOffset(10, 10));
		const renders = vi.fn();
		function App(): ReactElement {
			renders();
			return createElement("frame", { Name: "Bound", Size: size });
		}

		const world = mount(createElement(App));
		const frame = frameOf(world);
		expect((frame.Size as UDim2).X.Offset).toBe(10);
		expect(renders).toHaveBeenCalledTimes(1);

		setSize(UDim2.fromOffset(42, 10));
		expect((frame.Size as UDim2).X.Offset).toBe(42);
		// The whole point: the instance moved, React did not re-render.
		expect(renders).toHaveBeenCalledTimes(1);
		// And the write marked the instance dirty, so the world flushes it.
		flushDirtyNow();
	});

	it("accepts a mapped binding", () => {
		const [offset, setOffset] = createBinding(0);
		const world = mount(
			createElement("frame", {
				Name: "Mapped",
				Size: offset.map((value: number) => UDim2.fromOffset(200 + value, 50)),
			}),
		);
		const frame = frameOf(world);
		expect((frame.Size as UDim2).X.Offset).toBe(200);
		setOffset(20);
		expect((frame.Size as UDim2).X.Offset).toBe(220);
	});

	it("stops writing once the prop is replaced by a plain value", () => {
		const [transparency, setTransparency] = createBinding(0);
		let swap!: () => void;
		function App(): ReactElement {
			const [bound, setBound] = useState(true);
			swap = () => setBound(false);
			return createElement("frame", {
				Name: "Swapped",
				BackgroundTransparency: bound ? transparency : 1,
			});
		}

		const world = mount(createElement(App));
		const frame = frameOf(world);
		setTransparency(0.5);
		expect(frame.BackgroundTransparency).toBe(0.5);

		swap();
		expect(frame.BackgroundTransparency).toBe(1);
		// The old binding is no longer connected to the prop.
		setTransparency(0.25);
		expect(frame.BackgroundTransparency).toBe(1);
	});

	it("releases the subscription when the element unmounts", () => {
		const [text, setText] = createBinding("first");
		let hide!: () => void;
		function App(): ReactElement {
			const [visible, setVisible] = useState(true);
			hide = () => setVisible(false);
			return createElement(
				"frame",
				{ Name: "Host" },
				visible
					? createElement("textlabel", { key: "t", Name: "Label", Text: text })
					: null,
			);
		}

		const world = mount(createElement(App));
		const label = frameOf(world).GetChildren()[0];
		if (!label) throw new Error("no label mounted");
		setText("second");
		expect(label.Text).toBe("second");

		hide();
		setText("third");
		// A detached instance must not keep being written to.
		expect(label.Text).toBe("second");
	});

	it("keeps one subscription across rerenders that reuse the binding", () => {
		const [count, setCount] = createBinding(0);
		let bump!: () => void;
		let writes = 0;
		function App(): ReactElement {
			const [, setTick] = useState(0);
			bump = () => setTick((t) => t + 1);
			return createElement("frame", {
				Name: "Stable",
				ZIndex: count.map((value: number) => {
					writes += 1;
					return value;
				}),
			});
		}

		const world = mount(createElement(App));
		const frame = frameOf(world);
		const before = writes;
		setCount(3);
		expect(frame.ZIndex).toBe(3);
		// One mapped read per update — not one per accumulated subscription.
		expect(writes - before).toBe(1);

		bump();
		bump();
		const beforeAgain = writes;
		setCount(4);
		expect(frame.ZIndex).toBe(4);
		expect(writes - beforeAgain).toBe(1);
	});

	it("drives Name, which is not an ordinary property write", () => {
		const [name, setName] = createBinding("One");
		const world = mount(createElement("frame", { Name: name }));
		const frame = frameOf(world);
		expect(frame.Name).toBe("One");
		setName("Two");
		expect(frame.Name).toBe("Two");
	});
});

describe("Binding as a type", () => {
	it("is structurally usable without importing the brand", () => {
		const [binding] = createBinding(1);
		const typed: Binding<number> = binding;
		expect(typed.getValue()).toBe(1);
	});
});
