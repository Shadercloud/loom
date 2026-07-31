/**
 * `binding.ts` — `@rbxts/react`-style bindings for the loom renderer.
 *
 * A binding is a value that changes *outside* React: the component renders
 * once with the binding in a prop, and every later value is written straight
 * onto the live `LoomInstance` by the host config (see `applyProps` in
 * `./index.ts`). That is the whole point — an animation driving 60 property
 * writes a second must never become 60 React commits.
 *
 * The shape mirrors Roblox's: `getValue()`, `map()` for derived bindings, and
 * `createBinding` / `useBinding` returning a `[binding, update]` pair. Derived
 * bindings subscribe lazily through their source, so `binding.map(f)` costs
 * nothing until something listens to it.
 *
 * Nothing here touches the reconciler, so it is also the piece a compatibility
 * shim (`@rbxts/react-ripple`'s `useSpring`) builds on — one binding
 * implementation, one identity, one `isBinding` that recognizes both.
 */
import { useState } from "react";

/**
 * Brand identifying a loom binding. `Symbol.for` (not `Symbol()`) so two copies
 * of this module — a workspace checkout and a pre-bundled dep chunk — still
 * recognize each other's bindings.
 */
export const BINDING: unique symbol = Symbol.for("@loom-dev/react.binding");

/** A value that updates outside the React render cycle. */
export interface Binding<T> {
	/** @internal Brand for {@link isBinding}. */
	readonly [BINDING]: true;
	/** The current value. */
	getValue(): T;
	/** A derived binding recomputed from this one on every change. */
	map<U>(mapper: (value: T) => U): Binding<U>;
	/**
	 * @internal Run `listener` on every change until the returned function is
	 * called. Used by the host config to keep a bound prop in sync; app code
	 * reads bindings through props and `getValue()`.
	 */
	subscribe(listener: (value: T) => void): () => void;
}

/** A prop that accepts either a plain value or a binding of one. */
export type Bindable<T> = T | Binding<T>;

/** Whether `value` is a loom binding. */
export function isBinding(value: unknown): value is Binding<unknown> {
	return typeof value === "object" && value !== null && BINDING in value;
}

/** Assemble a binding from its two primitive operations. */
function makeBinding<T>(
	getValue: () => T,
	subscribe: (listener: (value: T) => void) => () => void,
): Binding<T> {
	return {
		[BINDING]: true,
		getValue,
		subscribe,
		map<U>(mapper: (value: T) => U): Binding<U> {
			// Lazy: the mapper runs on read and on each source change, and the
			// derived binding holds no subscription of its own.
			return makeBinding(
				() => mapper(getValue()),
				(listener) => subscribe((value) => listener(mapper(value))),
			);
		},
	};
}

/**
 * A binding and its setter, outside any component — the non-hook half of the
 * `@rbxts/react` binding API. Updating notifies subscribers synchronously;
 * a bound prop write marks its instance dirty, so the change lands on the next
 * scheduler frame without a React commit.
 */
export function createBinding<T>(
	initialValue: T,
): [Binding<T>, (value: T) => void] {
	let current = initialValue;
	const listeners = new Set<(value: T) => void>();
	const binding = makeBinding<T>(
		() => current,
		(listener) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
	);
	return [
		binding,
		(value: T): void => {
			current = value;
			// Snapshot: a listener may unsubscribe (or subscribe) mid-notify.
			for (const listener of [...listeners]) listener(value);
		},
	];
}

/**
 * `createBinding` scoped to a component: the pair is created once and survives
 * every rerender (a later `initialValue` is ignored, as in `@rbxts/react`).
 */
export function useBinding<T>(
	initialValue: T,
): [Binding<T>, (value: T) => void] {
	return useState(() => createBinding(initialValue))[0];
}

/**
 * One binding over several: an array of bindings becomes a binding of their
 * values, a record of bindings a binding of a record. Recomputed — and fired —
 * on every change of any source.
 */
export function joinBindings<T>(bindings: readonly Binding<T>[]): Binding<T[]>;
export function joinBindings<T>(
	bindings: Readonly<Record<string, Binding<T>>>,
): Binding<Record<string, T>>;
export function joinBindings(
	bindings: readonly Binding<unknown>[] | Readonly<Record<string, unknown>>,
): Binding<unknown> {
	const isArray = Array.isArray(bindings);
	const entries = Object.entries(bindings) as Array<[string, Binding<unknown>]>;
	const read = (): unknown => {
		if (isArray) return entries.map(([, binding]) => binding.getValue());
		const value: Record<string, unknown> = {};
		for (const [key, binding] of entries) value[key] = binding.getValue();
		return value;
	};
	return makeBinding(read, (listener) => {
		const unsubscribes = entries.map(([, binding]) =>
			binding.subscribe(() => listener(read())),
		);
		return () => {
			for (const unsubscribe of unsubscribes) unsubscribe();
		};
	});
}
