/**
 * The Ripple hooks under a real loom mount: one controller per hook instance,
 * a binding that reaches the live instance without re-rendering, and cleanup
 * that survives React Strict Mode's double-invoked effects.
 *
 * Frames are driven by firing the runtime's Heartbeat directly — the same
 * signal the schedulers connect to — so these assertions cover the whole path
 * a scene actually uses, not a hand-stepped controller.
 */

import type { ComputeLayout, MountedWorld } from "@loom-dev/react";
import { mountSync } from "@loom-dev/react";
import { heartbeat, type LoomInstance, UDim2 } from "@loom-dev/runtime";
import { createElement, type ReactElement, StrictMode, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	motionScheduler,
	springScheduler,
	tweenScheduler,
	useMotion,
	useSpring,
	useTween,
} from "./react-ripple.ts";

// Node/result types come from `@loom-dev/scene`, which this package does not
// depend on — inferring them off `ComputeLayout` keeps the test honest without
// adding one.
type SceneNode = Parameters<ComputeLayout>[0];

/** Stub layout: no WASM, every node gets the same rect. */
const stubLayout: ComputeLayout = (root) => {
	const rects: ReturnType<ComputeLayout>["rects"] = {};
	const walk = (node: SceneNode): void => {
		rects[node.id ?? "?"] = { rect: { x: 0, y: 0, width: 800, height: 600 } };
		for (const child of node.children ?? []) walk(child);
	};
	walk(root);
	return { rects };
};

function makeMount(): HTMLElement {
	const mount = document.createElement("div");
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

/** The first instance under this world's default ScreenGui. */
function firstChild(world: MountedWorld): LoomInstance {
	const child = world.world.defaultGui.GetChildren()[0];
	if (!child) throw new Error("nothing mounted");
	return child;
}

/** Fire `frames` 60fps Heartbeats, as the runtime's rAF loop would. */
function frames(count: number): void {
	for (let i = 0; i < count; i++) heartbeat.fire(1 / 60);
}

afterEach(() => {
	mounted?.unmount();
	mounted = undefined;
	springScheduler.clear();
	tweenScheduler.clear();
	motionScheduler.clear();
	document.body.innerHTML = "";
});

describe("useSpring", () => {
	it("returns a destructurable [binding, controller] pair", () => {
		let captured: unknown;
		function App(): ReactElement {
			const pair = useSpring(0);
			captured = pair;
			return createElement("frame", { Name: "Pair" });
		}
		mount(createElement(App));

		expect(Array.isArray(captured)).toBe(true);
		const [binding, spring] = captured as [
			{ getValue(): number },
			{ setGoal(value: number): void },
		];
		expect(binding.getValue()).toBe(0);
		expect(spring.setGoal).toBeTypeOf("function");
	});

	it("renders the initial value, then animates the prop over frames", () => {
		let spring!: ReturnType<typeof useSpring<number>>[1];
		function App(): ReactElement {
			const [offset, controller] = useSpring(0);
			spring = controller;
			return createElement("frame", {
				Name: "Animated",
				Size: offset.map((value) => UDim2.fromOffset(200 + value, 50)),
			});
		}

		const world = mount(createElement(App));
		const frame = firstChild(world);
		// 1. The initial value is what renders.
		expect((frame.Size as UDim2).X.Offset).toBe(200);

		// 2. setGoal moves the binding across scheduler frames.
		spring.setGoal(20);
		frames(5);
		const midway = (frame.Size as UDim2).X.Offset;
		expect(midway).toBeGreaterThan(200);
		expect(midway).toBeLessThan(220);

		frames(600);
		expect((frame.Size as UDim2).X.Offset).toBe(220);

		// 3. Returning to the original goal animates back.
		spring.setGoal(0);
		frames(5);
		expect((frame.Size as UDim2).X.Offset).toBeLessThan(220);
		frames(600);
		expect((frame.Size as UDim2).X.Offset).toBe(200);
	});

	it("animates without re-rendering the component", () => {
		const renders = vi.fn();
		let spring!: ReturnType<typeof useSpring<number>>[1];
		function App(): ReactElement {
			renders();
			const [value, controller] = useSpring(0);
			spring = controller;
			return createElement("frame", { Name: "Quiet", ZIndex: value });
		}

		const world = mount(createElement(App));
		expect(renders).toHaveBeenCalledTimes(1);

		spring.setGoal(10);
		frames(60);
		expect(firstChild(world).ZIndex).not.toBe(0);
		// The whole reason bindings exist: 60 frames, still one render.
		expect(renders).toHaveBeenCalledTimes(1);
	});

	it("keeps one controller and one binding across rerenders", () => {
		const seen: unknown[] = [];
		let bump!: () => void;
		function App(): ReactElement {
			const [, setTick] = useState(0);
			bump = () => setTick((tick) => tick + 1);
			const [binding, spring] = useSpring(0);
			seen.push([binding, spring]);
			return createElement("frame", { Name: "Stable", ZIndex: binding });
		}

		mount(createElement(App));
		bump();
		bump();
		expect(seen.length).toBeGreaterThan(2);
		const [firstBinding, firstSpring] = seen[0] as unknown[];
		for (const pair of seen) {
			const [binding, spring] = pair as unknown[];
			expect(binding).toBe(firstBinding);
			expect(spring).toBe(firstSpring);
		}
	});

	it("keeps updating the instance after a rerender", () => {
		let bump!: () => void;
		let spring!: ReturnType<typeof useSpring<number>>[1];
		function App(): ReactElement {
			const [tick, setTick] = useState(0);
			bump = () => setTick((value) => value + 1);
			const [binding, controller] = useSpring(0);
			spring = controller;
			return createElement("frame", {
				Name: `Tick${tick}`,
				ZIndex: binding.map((value) => Math.round(value)),
			});
		}

		const world = mount(createElement(App));
		bump();
		spring.setGoal(50);
		frames(600);
		expect(firstChild(world).ZIndex).toBe(50);
	});

	it("registers exactly one scheduler entry per mounted hook", () => {
		function App(): ReactElement {
			const [a, springA] = useSpring(0);
			const [b, springB] = useSpring(0);
			springA.setGoal(1);
			springB.setGoal(2);
			return createElement("frame", { Name: "Two", ZIndex: a, LayoutOrder: b });
		}
		mount(createElement(App));
		frames(1);
		expect(springScheduler.size).toBe(2);
	});

	it("does not double-connect under Strict Mode", () => {
		let spring!: ReturnType<typeof useSpring<number>>[1];
		function App(): ReactElement {
			const [binding, controller] = useSpring(0);
			spring = controller;
			return createElement("frame", { Name: "Strict", ZIndex: binding });
		}

		mount(createElement(StrictMode, null, createElement(App)));
		spring.setGoal(10);
		// Strict Mode mounts, unmounts and remounts effects; a cleanup that did
		// not fully undo its setup would leave two entries (or none).
		expect(springScheduler.size).toBe(1);
		frames(600);
		expect(spring.getPosition()).toBe(10);
	});

	it("stops scheduling once the component unmounts", () => {
		function App(): ReactElement {
			const [binding, spring] = useSpring(0);
			spring.setGoal(1000);
			return createElement("frame", { Name: "Leaving", ZIndex: binding });
		}

		const world = mount(createElement(App));
		frames(1);
		expect(springScheduler.size).toBe(1);
		expect(springScheduler.connected).toBe(true);

		world.unmount();
		mounted = undefined;
		expect(springScheduler.size).toBe(0);
		// One more frame and the shared Heartbeat listener lets go too.
		frames(1);
		expect(springScheduler.connected).toBe(false);
	});

	it("keeps separate hook instances independent", () => {
		const springs: Array<ReturnType<typeof useSpring<number>>[1]> = [];
		function Item({ id }: { id: number }): ReactElement {
			const [binding, spring] = useSpring(0);
			springs[id] = spring;
			return createElement("frame", { Name: `Item${id}`, ZIndex: binding });
		}
		function App(): ReactElement {
			return createElement(
				"frame",
				{ Name: "List" },
				createElement(Item, { key: 0, id: 0 }),
				createElement(Item, { key: 1, id: 1 }),
			);
		}

		const world = mount(createElement(App));
		const [first, second] = firstChild(world).GetChildren();
		if (!first || !second) throw new Error("expected two items");

		springs[0]?.setGoal(30);
		frames(600);
		expect(first.ZIndex).toBe(30);
		// The untouched sibling never moved.
		expect(second.ZIndex).toBe(0);
	});

	it("honours start: false by staying off the frame loop", () => {
		let spring!: ReturnType<typeof useSpring<number>>[1];
		function App(): ReactElement {
			const [binding, controller] = useSpring(0, { start: false });
			spring = controller;
			return createElement("frame", { Name: "Manual", ZIndex: binding });
		}

		const world = mount(createElement(App));
		spring.setGoal(10);
		frames(60);
		expect(springScheduler.size).toBe(0);
		expect(firstChild(world).ZIndex).toBe(0);
	});
});

describe("useTween and useMotion", () => {
	it("drive a prop the same way", () => {
		let tween!: ReturnType<typeof useTween<number>>[1];
		let motion!: ReturnType<typeof useMotion<number>>[1];
		function App(): ReactElement {
			const [tweened, tweenController] = useTween(0, { duration: 0.25 });
			const [motioned, motionController] = useMotion(0);
			tween = tweenController;
			motion = motionController;
			return createElement("frame", {
				Name: "Both",
				ZIndex: tweened.map(Math.round),
				LayoutOrder: motioned.map(Math.round),
			});
		}

		const world = mount(createElement(App));
		const frame = firstChild(world);

		tween.setGoal(10);
		motion.setGoal(20);
		expect(tweenScheduler.size).toBe(1);
		expect(motionScheduler.size).toBe(1);

		frames(600);
		expect(frame.ZIndex).toBe(10);
		expect(frame.LayoutOrder).toBe(20);
	});

	it("clean up their schedulers on unmount", () => {
		function App(): ReactElement {
			const [tweened, tween] = useTween(0, { duration: 5 });
			const [motioned, motion] = useMotion(0);
			tween.setGoal(1);
			motion.setGoal(1);
			return createElement("frame", {
				Name: "Leaving",
				ZIndex: tweened.map(Math.round),
				LayoutOrder: motioned.map(Math.round),
			});
		}

		const world = mount(createElement(App));
		frames(1);
		expect(tweenScheduler.size).toBe(1);
		expect(motionScheduler.size).toBe(1);

		world.unmount();
		mounted = undefined;
		expect(tweenScheduler.size).toBe(0);
		expect(motionScheduler.size).toBe(0);
	});
});

describe("the re-exported core", () => {
	it("carries the whole @rbxts/ripple surface", async () => {
		const reactRipple = await import("./react-ripple.ts");
		for (const name of [
			"createSpring",
			"createTween",
			"createMotion",
			"config",
			"easing",
		]) {
			expect(reactRipple, name).toHaveProperty(name);
		}
	});
});
