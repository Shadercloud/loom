/**
 * `createMotion` — a port of Ripple's `motion.luau`.
 *
 * A motion owns both a spring and a tween and hands control to whichever one
 * the caller last asked for, carrying the position across the switch (and
 * killing the spring's velocity on the way into a tween) so an interrupted
 * animation continues from where it was rather than snapping.
 */
import type { Animatable, PartialGoal } from "./animatable.ts";
import { createScheduler } from "./scheduler.ts";
import { createSignal, type Fire, type Subscribe } from "./signal.ts";
import { createSpring, type Spring, type SpringOptions } from "./spring.ts";
import { createTween, type Tween, type TweenOptions } from "./tween.ts";

export interface MotionOptions<T extends Animatable = Animatable> {
	/** Connect to the frame loop immediately (the hooks pass this for you). */
	start?: boolean;
	spring?: SpringOptions<T>;
	/** Present (even empty) means the motion starts in tween mode. */
	tween?: TweenOptions<T>;
}

export interface Motion<T extends Animatable = Animatable> {
	getPosition(): T;
	getVelocity(): T;
	getGoal(): T;

	setPosition(value: PartialGoal<T>): void;
	setVelocity(value: PartialGoal<T>): void;
	setGoal(value: PartialGoal<T>, options?: MotionOptions<T>): void;

	onChange(callback: (value: T, deltaTime: number) => void): () => void;
	onComplete(callback: (value: T) => void): () => void;

	/** Advance by `deltaTime` by hand, outside the frame loop. */
	step(deltaTime: number): T;
	/** Switch to spring mode and set its goal. */
	spring(goal: PartialGoal<T>, options?: SpringOptions<T>): void;
	/** Switch to tween mode and set its goal. */
	tween(goal: PartialGoal<T>, options?: TweenOptions<T>): void;
	idle(): boolean;
	configure(options: MotionOptions<T>): void;

	start(): void;
	stop(): void;
	destroy(): void;
}

/** The slice of a controller a motion drives, whichever kind it is. */
interface MotionLike<T extends Animatable> {
	step(deltaTime: number): T;
	idle(): boolean;
	getPosition(): T;
	getGoal(): T;
	setPosition(value: PartialGoal<T>): void;
	setGoal(value: PartialGoal<T>): void;
}

interface MotionState<T extends Animatable> {
	spring: Spring<T>;
	tween: Tween<T>;
	current: MotionLike<T>;
	started: boolean;
	complete: boolean;
	fireComplete: Fire<[T]>;
}

/** One Heartbeat listener drives every running motion in the page. */
export const motionScheduler = createScheduler<MotionState<Animatable>>(
	(state, deltaTime, remove) => {
		if (state.complete) {
			remove(state);
			return state.current.getPosition();
		}

		const position = state.current.step(deltaTime);

		if (state.current.idle()) {
			remove(state);
			state.complete = true;
			state.fireComplete(position);
		}

		return position;
	},
);

/**
 * `start: true` on a motion means *the motion* joins the frame loop — the inner
 * controllers are stepped by it, so they must not connect themselves as well.
 */
function withoutStart<O extends { start?: boolean }>(
	options: O | undefined,
): O | undefined {
	if (options === undefined || options.start !== true) return options;
	return { ...options, start: false };
}

class MotionImpl<T extends Animatable> implements Motion<T> {
	readonly state: MotionState<T>;
	private readonly subscribeChange: Subscribe<[T, number]>;
	private readonly subscribeComplete: Subscribe<[T]>;
	private readonly clearChange: () => void;
	private readonly clearComplete: () => void;

	constructor(initialValue: T, options: MotionOptions<T>) {
		const motionSpring = createSpring(
			initialValue,
			withoutStart(options.spring) ?? {},
		);
		const motionTween = createTween(
			initialValue,
			withoutStart(options.tween) ?? {},
		);
		const [subscribeChange, fireChange, clearChange] =
			createSignal<[T, number]>();
		const [subscribeComplete, fireComplete, clearComplete] =
			createSignal<[T]>();
		this.subscribeChange = subscribeChange;
		this.subscribeComplete = subscribeComplete;
		this.clearChange = clearChange;
		this.clearComplete = clearComplete;
		this.state = {
			spring: motionSpring,
			tween: motionTween,
			// No `tween` options at all means the motion starts as a spring.
			current: options.tween ? motionTween : motionSpring,
			started: false,
			complete: true,
			fireComplete,
		};

		if (options.start) this.start();

		// Only the controller currently in charge is allowed to report changes;
		// the other one may still be settling from a previous handoff.
		const state = this.state;
		motionSpring.onChange((value, deltaTime) => {
			if (state.current === motionSpring) fireChange(value, deltaTime);
		});
		motionTween.onChange((value, deltaTime) => {
			if (state.current === motionTween) fireChange(value, deltaTime);
		});
	}

	/** See {@link SpringImpl.shared} — one scheduler holds every value type. */
	private get shared(): MotionState<Animatable> {
		return this.state as unknown as MotionState<Animatable>;
	}

	private scheduleUpdate(): void {
		this.state.complete = false;
		if (this.state.started) motionScheduler.add(this.shared);
	}

	private prepareSpring(): void {
		const state = this.state;
		if (state.current === state.spring) return;
		state.spring.setPosition(state.tween.getPosition() as PartialGoal<T>);
		state.current = state.spring;
	}

	private prepareTween(): void {
		const state = this.state;
		if (state.current === state.tween) return;
		state.tween.setPosition(state.spring.getPosition() as PartialGoal<T>);
		state.spring.halt();
		state.current = state.tween;
	}

	start(): void {
		this.state.started = true;
		if (!this.state.complete) motionScheduler.add(this.shared);
	}

	stop(): void {
		this.state.started = false;
		motionScheduler.remove(this.shared);
	}

	idle(): boolean {
		return this.state.complete;
	}

	step(deltaTime: number): T {
		return motionScheduler.update(this.shared, deltaTime) as T;
	}

	configure(options: MotionOptions<T>): void {
		if (options.spring) this.state.spring.configure(options.spring);
		if (options.tween) this.state.tween.configure(options.tween);
		if (!this.state.current.idle()) this.scheduleUpdate();
	}

	getPosition(): T {
		return this.state.current.getPosition();
	}

	getVelocity(): T {
		return this.state.spring.getVelocity();
	}

	getGoal(): T {
		return this.state.current.getGoal();
	}

	setPosition(value: PartialGoal<T>): void {
		this.state.current.setPosition(value);
		if (!this.state.current.idle()) this.scheduleUpdate();
	}

	setVelocity(value: PartialGoal<T>): void {
		if (this.state.current !== this.state.spring) return;
		this.state.spring.setVelocity(value);
		if (!this.state.current.idle()) this.scheduleUpdate();
	}

	setGoal(value: PartialGoal<T>, options?: MotionOptions<T>): void {
		// Options naming a mode switch the motion into it, rather than retuning
		// whichever controller happens to be active.
		if (options?.spring) {
			this.spring(value, options.spring);
			return;
		}
		if (options?.tween) {
			this.tween(value, options.tween);
			return;
		}

		this.state.current.setGoal(value);
		if (!this.state.current.idle()) this.scheduleUpdate();
	}

	spring(value: PartialGoal<T>, options?: SpringOptions<T>): void {
		this.prepareSpring();
		this.state.spring.setGoal(value, options);
		if (!this.state.spring.idle()) this.scheduleUpdate();
	}

	tween(value: PartialGoal<T>, options?: TweenOptions<T>): void {
		this.prepareTween();
		this.state.tween.setGoal(value, options);
		if (!this.state.tween.idle()) this.scheduleUpdate();
	}

	onChange(callback: (value: T, deltaTime: number) => void): () => void {
		return this.subscribeChange(callback);
	}

	onComplete(callback: (value: T) => void): () => void {
		return this.subscribeComplete(callback);
	}

	/** Stops, tears down both inner controllers, and drops the callbacks. */
	destroy(): void {
		this.stop();
		this.state.spring.destroy();
		this.state.tween.destroy();
		this.clearChange();
		this.clearComplete();
	}
}

/** The `number` overload widens literals — see {@link createSpring}. */
export function createMotion(
	initialValue: number,
	options?: MotionOptions<number>,
): Motion<number>;
export function createMotion<T extends Animatable>(
	initialValue: T,
	options?: MotionOptions<T>,
): Motion<T>;
export function createMotion<T extends Animatable>(
	initialValue: T,
	options: MotionOptions<T> = {},
): Motion<T> {
	return new MotionImpl(initialValue, options);
}
