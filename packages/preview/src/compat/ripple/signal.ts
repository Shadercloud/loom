/**
 * The tiny callback list behind `onChange` / `onComplete`, ported from Ripple's
 * `utils/signal.luau`.
 *
 * Deliberately not loom's `LoomSignal`: these are plain controller callbacks,
 * not instance events, and firing must stay synchronous (Ripple's Luau version
 * spawns each listener on a pooled thread purely to isolate errors — in the
 * browser there is no thread to pool, and a synchronous fire is what lets a
 * binding update land in the same frame as the step that produced it).
 */

/** Subscribe; the returned function unsubscribes and is safe to call twice. */
export type Subscribe<A extends unknown[]> = (
	listener: (...args: A) => void,
) => () => void;

/** Fire every current listener. */
export type Fire<A extends unknown[]> = (...args: A) => void;

/**
 * `[subscribe, fire, clear]`. `clear` drops every listener at once — what
 * `controller.destroy()` uses to release callbacks it can no longer serve.
 */
export function createSignal<A extends unknown[]>(): [
	Subscribe<A>,
	Fire<A>,
	() => void,
] {
	const listeners = new Set<(...args: A) => void>();
	return [
		(listener) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		(...args) => {
			// Snapshot: a listener may unsubscribe itself (or another) mid-fire.
			for (const listener of [...listeners]) {
				if (listeners.has(listener)) listener(...args);
			}
		},
		() => {
			listeners.clear();
		},
	];
}
