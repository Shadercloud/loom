/**
 * `createSpring` — a port of Ripple's `spring.luau`.
 *
 * The integrator itself is Otter's closed-form spring solution (critically
 * damped / underdamped / overdamped branches), reproduced component-for-
 * component so a spring settles on the same values in loom as it does in
 * Roblox. Everything around it — the rest thresholds, the `complete` latch, the
 * order in which `onChange` and `onComplete` fire — is faithful too, because
 * component libraries lean on that ordering.
 */
import {
	type Animatable,
	addValue,
	assignIntermediate,
	copyIntermediate,
	createIntermediate,
	getValue,
	type Intermediate,
	type PartialGoal,
	recomputeValue,
	setValue,
	zeroIntermediate,
} from "./animatable.ts";
import { createScheduler } from "./scheduler.ts";
import { createSignal, type Fire, type Subscribe } from "./signal.ts";

/** Ripple's default rest threshold, and the velocity multiple derived from it. */
const DEFAULT_REST_POSITION = 1e-3;
const VELOCITY_THRESHOLD_MULTIPLIER = 1000 / 16;

export interface SpringOptions<T extends Animatable = Animatable> {
	/** Connect to the frame loop immediately (the hooks pass this for you). */
	start?: boolean;
	tension?: number;
	friction?: number;
	mass?: number;
	/** Set with `frequency` to bypass the tension/friction/mass conversion. */
	dampingRatio?: number;
	frequency?: number;
	/** Rest threshold for position; velocity's default is derived from it. */
	precision?: number;
	restVelocity?: number;
	position?: PartialGoal<T>;
	velocity?: PartialGoal<T>;
	impulse?: PartialGoal<T>;
}

export interface Spring<T extends Animatable = Animatable> {
	getPosition(): T;
	getVelocity(): T;
	getGoal(): T;

	setPosition(value: PartialGoal<T>): void;
	setVelocity(value: PartialGoal<T>): void;
	setGoal(value: PartialGoal<T>, options?: SpringOptions<T>): void;

	onChange(callback: (value: T, deltaTime: number) => void): () => void;
	onComplete(callback: (value: T) => void): () => void;

	/** Advance by `deltaTime` by hand, outside the frame loop. */
	step(deltaTime: number): T;
	/** Add to the current velocity. */
	impulse(amount: PartialGoal<T>): void;
	/** Kill the velocity without moving the position. */
	halt(): void;
	/** Whether the spring has settled on its goal. */
	idle(): boolean;
	configure(options: SpringOptions<T>): void;

	start(): void;
	stop(): void;
	destroy(): void;
}

interface SpringState<T extends Animatable> {
	position: Intermediate<T>;
	velocity: Intermediate<T>;
	goal: Intermediate<T>;
	dampingRatio: number;
	frequency: number;
	restPosition: number;
	restVelocity: number;
	started: boolean;
	complete: boolean;
	fireChange: Fire<[T, number]>;
	fireComplete: Fire<[T]>;
}

/** One Heartbeat listener drives every running spring in the page. */
export const springScheduler = createScheduler<SpringState<Animatable>>(
	(state, deltaTime, remove) => {
		if (state.complete) {
			remove(state);
			return getValue(state.position);
		}

		const { position, velocity, goal } = state;
		const { restPosition, restVelocity, dampingRatio: d } = state;
		const f = state.frequency * 2 * Math.PI;
		const decay = Math.exp(-deltaTime * d * f);
		const p = position.components;
		const v = velocity.components;
		const g = goal.components;
		let complete = true;

		// Spring calculation from Otter:
		// https://github.com/Roblox/otter/blob/main/modules/otter/src/spring.lua
		if (d === 1) {
			// Critically damped.
			for (let i = 0; i < p.length; i++) {
				const p0 = p[i] ?? 0;
				const v0 = v[i] ?? 0;
				const target = g[i] ?? 0;
				const offset = p0 - target;

				const p1 =
					(v0 * deltaTime + offset * (f * deltaTime + 1)) * decay + target;
				const v1 = (v0 - f * deltaTime * (offset * f + v0)) * decay;

				if (complete) {
					complete =
						Math.abs(p1 - target) <= restPosition &&
						Math.abs(v1) <= restVelocity;
				}
				p[i] = p1;
				v[i] = v1;
			}
		} else if (d < 1) {
			// Underdamped. The series expansions cover `c` (and `f * c`) near zero,
			// where the closed form divides by ~0.
			const c = (1 - d * d) ** 0.5;
			const i0 = Math.cos(f * c * deltaTime);
			const j = Math.sin(f * c * deltaTime);

			let z: number;
			if (c > 1e-4) {
				z = j / c;
			} else {
				const a = deltaTime * f;
				z = a + ((a * a * (c * c) * (c * c)) / 20 - c * c) * ((a * a * a) / 6);
			}

			let y: number;
			if (f * c > 1e-4) {
				y = j / (f * c);
			} else {
				const b = f * c;
				y =
					deltaTime +
					((deltaTime * deltaTime * (b * b) * (b * b)) / 20 - b * b) *
						((deltaTime * deltaTime * deltaTime) / 6);
			}

			for (let i = 0; i < p.length; i++) {
				const p0 = p[i] ?? 0;
				const v0 = v[i] ?? 0;
				const target = g[i] ?? 0;
				const offset = p0 - target;

				const p1 = (offset * (i0 + d * z) + v0 * y) * decay + target;
				const v1 = (v0 * (i0 - z * d) - offset * (z * f)) * decay;

				if (complete) {
					complete =
						Math.abs(p1 - target) <= restPosition &&
						Math.abs(v1) <= restVelocity;
				}
				p[i] = p1;
				v[i] = v1;
			}
		} else {
			// Overdamped.
			const c = Math.sqrt(d * d - 1);
			const r1 = -f * (d - c);
			const r2 = -f * (d + c);
			const ec1 = Math.exp(r1 * deltaTime);
			const ec2 = Math.exp(r2 * deltaTime);

			for (let i = 0; i < p.length; i++) {
				const p0 = p[i] ?? 0;
				const v0 = v[i] ?? 0;
				const target = g[i] ?? 0;
				const offset = p0 - target;

				const co2 = (v0 - offset * r1) / (2 * f * c);
				const co1 = ec1 * (offset - co2);

				const p1 = co1 + co2 * ec2 + target;
				const v1 = co1 * r1 + co2 * ec2 * r2;

				if (complete) {
					complete =
						Math.abs(p1 - target) <= restPosition &&
						Math.abs(v1) <= restVelocity;
				}
				p[i] = p1;
				v[i] = v1;
			}
		}

		// Landing exactly on the goal (rather than within the threshold) is what
		// keeps a settled spring from leaving a sub-pixel offset behind.
		const value = complete ? getValue(goal) : recomputeValue(position);

		velocity.dirty = true;
		state.complete = complete;
		state.fireChange(value, deltaTime);

		if (complete) {
			remove(state);
			assignIntermediate(position, goal);
			zeroIntermediate(velocity);
			state.fireComplete(value);
		}

		return value;
	},
);

class SpringImpl<T extends Animatable> implements Spring<T> {
	readonly state: SpringState<T>;
	private readonly subscribeChange: Subscribe<[T, number]>;
	private readonly subscribeComplete: Subscribe<[T]>;
	private readonly clearChange: () => void;
	private readonly clearComplete: () => void;

	constructor(initialValue: T, options: SpringOptions<T>) {
		const position = createIntermediate<T>(
			(options.position as T | undefined) ?? initialValue,
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
			position,
			velocity: zeroIntermediate(copyIntermediate(position)),
			goal: copyIntermediate(position),
			dampingRatio: 1,
			frequency: 1,
			restPosition: DEFAULT_REST_POSITION,
			restVelocity: DEFAULT_REST_POSITION * VELOCITY_THRESHOLD_MULTIPLIER,
			started: false,
			complete: true,
			fireChange,
			fireComplete,
		};

		this.configure(options);
		if (options.start) this.start();
	}

	/**
	 * This spring's state as the scheduler sees it. The scheduler holds every
	 * spring in the page regardless of value type, so its element type is the
	 * `Animatable` union; the integrator only ever touches numeric components,
	 * which are the same shape either way.
	 */
	private get shared(): SpringState<Animatable> {
		return this.state as unknown as SpringState<Animatable>;
	}

	private scheduleUpdate(): void {
		this.state.complete = false;
		if (this.state.started) springScheduler.add(this.shared);
	}

	start(): void {
		this.state.started = true;
		if (!this.state.complete) springScheduler.add(this.shared);
	}

	stop(): void {
		this.state.started = false;
		springScheduler.remove(this.shared);
	}

	idle(): boolean {
		return this.state.complete;
	}

	step(deltaTime: number): T {
		return springScheduler.update(this.shared, deltaTime) as T;
	}

	configure(options: SpringOptions<T>): void {
		const state = this.state;
		state.restPosition = options.precision ?? state.restPosition;
		// Ripple re-derives the velocity threshold from the position one on every
		// configure unless it is given explicitly.
		state.restVelocity =
			options.restVelocity ??
			state.restPosition * VELOCITY_THRESHOLD_MULTIPLIER;

		if (options.dampingRatio !== undefined || options.frequency !== undefined) {
			state.dampingRatio = options.dampingRatio ?? state.dampingRatio;
			state.frequency = options.frequency ?? state.frequency;
		} else {
			const tension = options.tension ?? 170;
			const friction = options.friction ?? 26;
			const mass = options.mass ?? 1;
			state.dampingRatio = friction / (2 * (mass * tension) ** 0.5);
			state.frequency = (tension / mass) ** 0.5 / 2 / Math.PI;
		}

		if (options.velocity !== undefined) this.setVelocity(options.velocity);
		if (options.impulse !== undefined) this.impulse(options.impulse);
		if (options.position !== undefined) this.setPosition(options.position);
	}

	getPosition(): T {
		return getValue(this.state.position);
	}

	getVelocity(): T {
		return getValue(this.state.velocity);
	}

	getGoal(): T {
		return getValue(this.state.goal);
	}

	setPosition(value: PartialGoal<T>): void {
		if (setValue(this.state.position, value)) {
			this.scheduleUpdate();
			this.state.fireChange(getValue(this.state.position), 0);
		}
	}

	setVelocity(value: PartialGoal<T>): void {
		if (setValue(this.state.velocity, value)) this.scheduleUpdate();
	}

	setGoal(value: PartialGoal<T>, options?: SpringOptions<T>): void {
		if (options) this.configure(options);
		if (setValue(this.state.goal, value)) this.scheduleUpdate();
	}

	impulse(value: PartialGoal<T>): void {
		addValue(this.state.velocity, value);
		this.scheduleUpdate();
	}

	halt(): void {
		zeroIntermediate(this.state.velocity);
	}

	onChange(callback: (value: T, deltaTime: number) => void): () => void {
		return this.subscribeChange(callback);
	}

	onComplete(callback: (value: T) => void): () => void {
		return this.subscribeComplete(callback);
	}

	/**
	 * Ripple's `destroy` only stops the spring; loom's also drops the change and
	 * complete callbacks, so a controller torn down mid-animation cannot keep
	 * calling into an unmounted component.
	 */
	destroy(): void {
		this.stop();
		this.clearChange();
		this.clearComplete();
	}
}

/**
 * The `number` overload is not redundant: without it `createSpring(0)` infers
 * the *literal* type `0`, and `setGoal(100)` stops compiling. Ripple's own
 * `.d.ts` carries the same pair for the same reason.
 */
export function createSpring(
	initialValue: number,
	options?: SpringOptions<number>,
): Spring<number>;
export function createSpring<T extends Animatable>(
	initialValue: T,
	options?: SpringOptions<T>,
): Spring<T>;
export function createSpring<T extends Animatable>(
	initialValue: T,
	options: SpringOptions<T> = {},
): Spring<T> {
	return new SpringImpl(initialValue, options);
}
