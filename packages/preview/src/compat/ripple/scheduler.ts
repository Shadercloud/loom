/**
 * The frame source behind loom's Ripple compatibility.
 *
 * Ripple connects its schedulers to `RunService.Heartbeat`; loom's runtime
 * *is* that signal — one rAF loop, shared with the renderer, that stops itself
 * once nothing is listening. So a scheduler here connects to `heartbeat` and
 * disconnects the moment its last controller goes idle: no second animation
 * loop, no timer that outlives the scene, and nothing that keeps ticking in a
 * static build after the page settles.
 *
 * One connection per scheduler kind (spring, tween, motion), not one per
 * controller — a hundred springs cost a hundred entries in a Set and exactly
 * one Heartbeat listener.
 */
import { heartbeat, type LoomConnection } from "@loom-dev/runtime";

/** Drops a state out of the running set (passed to the updater). */
export type RemoveState<S> = (state: S) => void;

export interface RippleScheduler<S> {
	/** Start stepping `state` every frame (idempotent). */
	add(state: S): void;
	/** Stop stepping `state`; its data is untouched. */
	remove(state: S): void;
	/** Step one state by hand, outside the frame loop (`controller.step`). */
	update(state: S, deltaTime: number): unknown;
	/** Step every running state once — the frame callback, exposed for tests. */
	step(deltaTime: number): void;
	/** Drop every state and release the frame connection. */
	clear(): void;
	/** How many states are running (test introspection). */
	readonly size: number;
	/** Whether a Heartbeat listener is currently connected. */
	readonly connected: boolean;
}

/**
 * Build a scheduler around one updater. Iteration walks a snapshot, so an
 * updater may remove itself (the common case — a settled spring) or another
 * controller without disturbing the pass.
 */
export function createScheduler<S>(
	update: (state: S, deltaTime: number, remove: RemoveState<S>) => unknown,
): RippleScheduler<S> {
	const states = new Set<S>();
	let connection: LoomConnection | undefined;

	const remove: RemoveState<S> = (state) => {
		states.delete(state);
	};

	const step = (deltaTime: number): void => {
		for (const state of [...states]) {
			if (states.has(state)) update(state, deltaTime, remove);
		}
	};

	const disconnect = (): void => {
		connection?.Disconnect();
		connection = undefined;
	};

	const onHeartbeat = (deltaTime: number): void => {
		step(deltaTime);
		// Nothing left to animate: release the frame connection so the runtime's
		// rAF loop can stop too.
		if (states.size === 0) disconnect();
	};

	return {
		add(state: S): void {
			if (states.has(state)) return;
			states.add(state);
			connection ??= heartbeat.Connect(onHeartbeat);
		},
		remove,
		update(state: S, deltaTime: number): unknown {
			return update(state, deltaTime, remove);
		},
		step,
		clear(): void {
			states.clear();
			disconnect();
		},
		get size(): number {
			return states.size;
		},
		get connected(): boolean {
			return connection !== undefined;
		},
	};
}
