/**
 * `createTween` — a port of Ripple's `tween.luau`.
 *
 * A tween holds three plain values (`from`, `position`, `goal`) and walks
 * between them by elapsed time, so — unlike the spring — no component encoding
 * is involved; `interpolate` rebuilds the datatype on every step. Changing the
 * goal (or the position) restarts the run from wherever it currently is, which
 * is what makes a hover-in/hover-out pair reverse smoothly instead of jumping.
 */
import {
	type Animatable,
	applyPartial,
	interpolate,
	type PartialGoal,
	sameValue,
} from "./animatable.ts";
import { type Easing, easing as easingFunctions } from "./easing.ts";
import { createScheduler } from "./scheduler.ts";
import { createSignal, type Fire, type Subscribe } from "./signal.ts";

export interface TweenOptions<T extends Animatable = Animatable> {
	/** Connect to the frame loop immediately (the hooks pass this for you). */
	start?: boolean;
	easing?: Easing;
	/** Seconds for one pass. */
	duration?: number;
	/** Passes to run; negative means forever. */
	repeats?: number;
	/** Alternate direction between passes. */
	reverses?: boolean;
	position?: PartialGoal<T>;
}

export interface Tween<T extends Animatable = Animatable> {
	getPosition(): T;
	getFrom(): T;
	getGoal(): T;

	setPosition(value: PartialGoal<T>): void;
	setFrom(value: PartialGoal<T>): void;
	setGoal(value: PartialGoal<T>, options?: TweenOptions<T>): void;

	onChange(callback: (value: T, deltaTime: number) => void): () => void;
	onComplete(callback: (value: T) => void): () => void;

	/** Advance by `deltaTime` by hand, outside the frame loop. */
	step(deltaTime: number): T;
	/** Whether the tween has finished (or never started). */
	idle(): boolean;
	configure(options: TweenOptions<T>): void;

	start(): void;
	stop(): void;
	destroy(): void;
}

interface TweenState<T extends Animatable> {
	position: T;
	from: T;
	goal: T;
	easingFunction: (x: number) => number;
	duration: number;
	repeats: number;
	reverses: boolean;
	elapsed: number;
	started: boolean;
	complete: boolean;
	fireChange: Fire<[T, number]>;
	fireComplete: Fire<[T]>;
}

/** Infinite repeats are written as a negative count; normalize for the math. */
function repeatLimit(repeats: number): number {
	return repeats < 0 ? Number.POSITIVE_INFINITY : repeats;
}

/** Progress (in passes) → the 0..1 alpha of the current pass. */
function getAlpha(
	progress: number,
	repeats: number,
	reverses: boolean,
): number {
	const limit = repeatLimit(repeats);
	if (limit > 1 && progress >= 1) {
		if (reverses) return Math.abs(((progress - 1) % 2) - 1);
		if (progress < limit) return progress % 1;
		return 1;
	}
	return progress;
}

/** One Heartbeat listener drives every running tween in the page. */
export const tweenScheduler = createScheduler<TweenState<Animatable>>(
	(state, deltaTime, remove) => {
		if (state.complete) {
			remove(state);
			return state.position;
		}

		state.elapsed += deltaTime;

		const limit = repeatLimit(state.repeats);
		let progress = Math.min(Math.max(state.elapsed / state.duration, 0), limit);
		// A zero duration divides to Infinity or NaN; snap straight to the end.
		if (Number.isNaN(progress)) progress = limit;

		const alpha = getAlpha(progress, state.repeats, state.reverses);
		// Ripple only eases strictly inside the pass, so the endpoints stay exact
		// for easings that overshoot (`back*`, `elastic*`).
		const eased = alpha > 0 && alpha < 1 ? state.easingFunction(alpha) : alpha;
		const value = interpolate(state.from, state.goal, eased);

		state.position = value;
		state.fireChange(value, deltaTime);

		if (progress === limit) {
			remove(state);
			state.complete = true;
			state.fireComplete(value);
		}

		return value;
	},
);

class TweenImpl<T extends Animatable> implements Tween<T> {
	readonly state: TweenState<T>;
	private readonly subscribeChange: Subscribe<[T, number]>;
	private readonly subscribeComplete: Subscribe<[T]>;
	private readonly clearChange: () => void;
	private readonly clearComplete: () => void;

	constructor(initialValue: T, options: TweenOptions<T>) {
		const position = (options.position as T | undefined) ?? initialValue;
		const [subscribeChange, fireChange, clearChange] =
			createSignal<[T, number]>();
		const [subscribeComplete, fireComplete, clearComplete] =
			createSignal<[T]>();
		this.subscribeChange = subscribeChange;
		this.subscribeComplete = subscribeComplete;
		this.clearChange = clearChange;
		this.clearComplete = clearComplete;
		this.state = {
			position,
			from: position,
			goal: position,
			easingFunction: easingFunctions.linear,
			duration: 1,
			repeats: 1,
			reverses: false,
			elapsed: 0,
			started: false,
			complete: true,
			fireChange,
			fireComplete,
		};

		this.configure(options);
		if (options.start) this.start();
	}

	/** See {@link SpringImpl.shared} — one scheduler holds every value type. */
	private get shared(): TweenState<Animatable> {
		return this.state as unknown as TweenState<Animatable>;
	}

	/** Restart the run from the current position (goal or position changed). */
	private resumeFromCurrentPosition(): void {
		const state = this.state;
		state.complete = false;
		state.elapsed = 0;
		state.from = state.position;
		if (state.started) tweenScheduler.add(this.shared);
	}

	start(): void {
		this.state.started = true;
		if (!this.state.complete) tweenScheduler.add(this.shared);
	}

	stop(): void {
		this.state.started = false;
		tweenScheduler.remove(this.shared);
	}

	idle(): boolean {
		return this.state.complete;
	}

	step(deltaTime: number): T {
		return tweenScheduler.update(this.shared, deltaTime) as T;
	}

	configure(options: TweenOptions<T>): void {
		const state = this.state;
		state.easingFunction = options.easing
			? (easingFunctions[options.easing] ?? state.easingFunction)
			: state.easingFunction;
		state.duration = options.duration ?? state.duration;
		state.repeats = options.repeats ?? state.repeats;
		state.reverses = options.reverses ?? state.reverses;

		if (options.position !== undefined) this.setPosition(options.position);

		// Retiming mid-run: replay the remainder under the new settings.
		if (!state.complete && state.elapsed !== 0) {
			this.resumeFromCurrentPosition();
		}
	}

	getPosition(): T {
		return this.state.position;
	}

	getFrom(): T {
		return this.state.from;
	}

	getGoal(): T {
		return this.state.goal;
	}

	setPosition(value: PartialGoal<T>): void {
		const position = applyPartial(this.state.position, value);
		if (sameValue(this.state.position, position)) return;
		this.state.position = position;
		this.resumeFromCurrentPosition();
		this.state.fireChange(position, 0);
	}

	setFrom(value: PartialGoal<T>): void {
		this.state.from = applyPartial(this.state.from, value);
	}

	setGoal(value: PartialGoal<T>, options?: TweenOptions<T>): void {
		if (options) this.configure(options);
		const goal = applyPartial(this.state.goal, value);
		if (sameValue(this.state.goal, goal)) return;
		this.state.goal = goal;
		this.resumeFromCurrentPosition();
	}

	onChange(callback: (value: T, deltaTime: number) => void): () => void {
		return this.subscribeChange(callback);
	}

	onComplete(callback: (value: T) => void): () => void {
		return this.subscribeComplete(callback);
	}

	/** Stops, and drops the callbacks (see the note on `Spring.destroy`). */
	destroy(): void {
		this.stop();
		this.clearChange();
		this.clearComplete();
	}
}

/** The `number` overload widens literals — see {@link createSpring}. */
export function createTween(
	initialValue: number,
	options?: TweenOptions<number>,
): Tween<number>;
export function createTween<T extends Animatable>(
	initialValue: T,
	options?: TweenOptions<T>,
): Tween<T>;
export function createTween<T extends Animatable>(
	initialValue: T,
	options: TweenOptions<T> = {},
): Tween<T> {
	return new TweenImpl(initialValue, options);
}
