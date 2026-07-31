/**
 * `@rbxts/react-ripple` — loom's browser runtime for Ripple's React hooks.
 *
 * The package is Luau-only (see `./ripple.ts` for what that breaks), and it
 * re-exports the whole `@rbxts/ripple` surface on top of its three hooks, so
 * this module does the same.
 *
 * The hooks are the reason loom needed React bindings at all: a spring writes a
 * new value every frame, and routing that through `useState` would mean a React
 * commit per frame for every animated element. Instead each hook owns one
 * binding, the controller pushes into it, and `@loom-dev/react` writes the
 * value straight onto the live instance — one dirty mark, one flush, no render.
 *
 * `useBinding` comes from `@loom-dev/react`, which is exactly what the
 * `@rbxts/react` alias re-exports, so a binding minted here is the same kind of
 * object the renderer resolves in props and app code can `.map()` over.
 */
import { type Binding, useBinding } from "@loom-dev/react";
import { useEffect, useRef } from "react";
import type { Animatable } from "./ripple/animatable.ts";
import {
	createMotion,
	type Motion,
	type MotionOptions,
} from "./ripple/motion.ts";
import {
	createSpring,
	type Spring,
	type SpringOptions,
} from "./ripple/spring.ts";
import { createTween, type Tween, type TweenOptions } from "./ripple/tween.ts";

export * from "./ripple.ts";

/**
 * The `[binding, controller]` pair the hooks return. roblox-ts types it as a
 * `LuaTuple`, which destructures the same way an array does — and an array is
 * what the browser needs.
 */
export type MotionBinding<T extends Animatable, C> = [
	binding: Binding<T>,
	controller: C,
];

/** The slice of a controller the hooks drive. */
interface Controllable<T extends Animatable> {
	onChange(callback: (value: T, deltaTime: number) => void): () => void;
	start(): void;
	stop(): void;
}

/**
 * One controller per mounted hook instance, wired to one binding.
 *
 * The controller is created during the first render and kept in a ref, so it
 * survives every rerender — a later `initialOptions` is deliberately ignored
 * (as in Ripple), because recreating a controller mid-animation would drop its
 * velocity and its subscribers. `controller.configure(...)` retunes one in
 * place.
 *
 * The effect subscribes and starts on mount, and stops + unsubscribes on
 * unmount. That symmetry is also what makes React Strict Mode's double-invoked
 * effects safe: the cleanup fully undoes the setup, so the second pass leaves
 * exactly one subscription and one scheduler entry — never two frame listeners
 * for one hook.
 */
function useController<T extends Animatable, C extends Controllable<T>>(
	create: () => C,
	initialValue: T,
	start: boolean,
): MotionBinding<T, C> {
	const [binding, setValue] = useBinding(initialValue);
	const ref = useRef<C | undefined>(undefined);
	ref.current ??= create();
	const controller = ref.current;

	// The controller is stable for the component's lifetime, and re-running this
	// on an options change would restart the animation midway.
	// biome-ignore lint/correctness/useExhaustiveDependencies: mount-only by design.
	useEffect(() => {
		const disconnect = controller.onChange(setValue);
		if (start) controller.start();
		return () => {
			controller.stop();
			disconnect();
		};
	}, []);

	return [binding, controller];
}

/**
 * A spring bound to a React prop. See {@link useController}. The `number`
 * overload widens literals, so `useSpring(0)` gives a `Spring<number>` rather
 * than a `Spring<0>` — the same pair Ripple's own `.d.ts` declares.
 */
export function useSpring(
	initialValue: number,
	initialOptions?: SpringOptions<number>,
): MotionBinding<number, Spring<number>>;
export function useSpring<T extends Animatable>(
	initialValue: T,
	initialOptions?: SpringOptions<T>,
): MotionBinding<T, Spring<T>>;
export function useSpring<T extends Animatable>(
	initialValue: T,
	initialOptions?: SpringOptions<T>,
): MotionBinding<T, Spring<T>> {
	return useController(
		() => createSpring(initialValue, initialOptions),
		initialValue,
		initialOptions?.start !== false,
	);
}

/** A tween bound to a React prop. See {@link useController}. */
export function useTween(
	initialValue: number,
	initialOptions?: TweenOptions<number>,
): MotionBinding<number, Tween<number>>;
export function useTween<T extends Animatable>(
	initialValue: T,
	initialOptions?: TweenOptions<T>,
): MotionBinding<T, Tween<T>>;
export function useTween<T extends Animatable>(
	initialValue: T,
	initialOptions?: TweenOptions<T>,
): MotionBinding<T, Tween<T>> {
	return useController(
		() => createTween(initialValue, initialOptions),
		initialValue,
		initialOptions?.start !== false,
	);
}

/** A motion bound to a React prop. See {@link useController}. */
export function useMotion(
	initialValue: number,
	initialOptions?: MotionOptions<number>,
): MotionBinding<number, Motion<number>>;
export function useMotion<T extends Animatable>(
	initialValue: T,
	initialOptions?: MotionOptions<T>,
): MotionBinding<T, Motion<T>>;
export function useMotion<T extends Animatable>(
	initialValue: T,
	initialOptions?: MotionOptions<T>,
): MotionBinding<T, Motion<T>> {
	return useController(
		() => createMotion(initialValue, initialOptions),
		initialValue,
		initialOptions?.start !== false,
	);
}
