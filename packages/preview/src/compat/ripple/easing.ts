/**
 * Ripple's easing functions and spring presets, ported from `easing.luau` and
 * `config.luau`. The curves come from easings.net, so a tween named `backOut`
 * traces the same path in loom as it does in Roblox.
 *
 * The whole published set is here, not just the ones a demo happens to use —
 * these are pure numeric functions, and a missing name would surface as a tween
 * silently falling back to `linear`.
 */

/** Every easing name Ripple publishes. */
export type Easing =
	| "linear"
	| "instant"
	| "smoothstep"
	| "sineIn"
	| "sineOut"
	| "sineInOut"
	| "backIn"
	| "backOut"
	| "backInOut"
	| "quadIn"
	| "quadOut"
	| "quadInOut"
	| "quartIn"
	| "quartOut"
	| "quartInOut"
	| "quintIn"
	| "quintOut"
	| "quintInOut"
	| "bounceIn"
	| "bounceOut"
	| "bounceInOut"
	| "elasticIn"
	| "elasticOut"
	| "elasticInOut"
	| "expoIn"
	| "expoOut"
	| "expoInOut"
	| "circIn"
	| "circOut"
	| "circInOut"
	| "cubicIn"
	| "cubicOut"
	| "cubicInOut";

const PI = Math.PI;
const c1 = 1.70158;
const c2 = c1 * 1.525;
const c3 = c1 + 1;
const c4 = (2 * PI) / 3;
const c5 = (2 * PI) / 4.5;

function bounceOut(x: number): number {
	const n1 = 7.5625;
	const d1 = 2.75;
	if (x < 1 / d1) return n1 * x * x;
	if (x < 2 / d1) {
		const t = x - 1.5 / d1;
		return n1 * t * t + 0.75;
	}
	if (x < 2.5 / d1) {
		const t = x - 2.25 / d1;
		return n1 * t * t + 0.9375;
	}
	const t = x - 2.625 / d1;
	return n1 * t * t + 0.984375;
}

/** `easing.<name>(x)` — the alpha remapping a tween applies. */
export const easing: Record<Easing, (x: number) => number> = {
	linear: (x) => x,
	instant: (x) => (x === 0 ? 0 : 1),
	smoothstep: (x) => x * x * (3 - 2 * x),

	quadIn: (x) => x * x,
	quadOut: (x) => 1 - (1 - x) * (1 - x),
	quadInOut: (x) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2),

	cubicIn: (x) => x * x * x,
	cubicOut: (x) => 1 - (1 - x) ** 3,
	cubicInOut: (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2),

	quartIn: (x) => x * x * x * x,
	quartOut: (x) => 1 - (1 - x) ** 4,
	quartInOut: (x) => (x < 0.5 ? 8 * x * x * x * x : 1 - (-2 * x + 2) ** 4 / 2),

	quintIn: (x) => x * x * x * x * x,
	quintOut: (x) => 1 - (1 - x) ** 5,
	quintInOut: (x) =>
		x < 0.5 ? 16 * x * x * x * x * x : 1 - (-2 * x + 2) ** 5 / 2,

	sineIn: (x) => 1 - Math.cos((x * PI) / 2),
	sineOut: (x) => Math.sin((x * PI) / 2),
	sineInOut: (x) => -(Math.cos(PI * x) - 1) / 2,

	expoIn: (x) => (x === 0 ? 0 : 2 ** (10 * x - 10)),
	expoOut: (x) => (x === 1 ? 1 : 1 - 2 ** (-10 * x)),
	expoInOut: (x) => {
		if (x === 0) return 0;
		if (x === 1) return 1;
		return x < 0.5 ? 2 ** (20 * x - 10) / 2 : (2 - 2 ** (-20 * x + 10)) / 2;
	},

	circIn: (x) => 1 - (1 - x ** 2) ** 0.5,
	circOut: (x) => (1 - (x - 1) ** 2) ** 0.5,
	circInOut: (x) =>
		x < 0.5
			? (1 - (1 - (2 * x) ** 2) ** 0.5) / 2
			: ((1 - (-2 * x + 2) ** 2) ** 0.5 + 1) / 2,

	backIn: (x) => c3 * x * x * x - c1 * x * x,
	backOut: (x) => 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2,
	backInOut: (x) =>
		x < 0.5
			? ((2 * x) ** 2 * ((c2 + 1) * 2 * x - c2)) / 2
			: ((2 * x - 2) ** 2 * ((c2 + 1) * (x * 2 - 2) + c2) + 2) / 2,

	elasticIn: (x) => {
		if (x === 0) return 0;
		if (x === 1) return 1;
		return -(2 ** (10 * x - 10)) * Math.sin((x * 10 - 10.75) * c4);
	},
	elasticOut: (x) => {
		if (x === 0) return 0;
		if (x === 1) return 1;
		return 2 ** (-10 * x) * Math.sin((x * 10 - 0.75) * c4) + 1;
	},
	elasticInOut: (x) => {
		if (x === 0) return 0;
		if (x === 1) return 1;
		return x < 0.5
			? -(2 ** (20 * x - 10) * Math.sin((20 * x - 11.125) * c5)) / 2
			: (2 ** (-20 * x + 10) * Math.sin((20 * x - 11.125) * c5)) / 2 + 1;
	},

	bounceIn: (x) => 1 - bounceOut(1 - x),
	bounceOut,
	bounceInOut: (x) =>
		x < 0.5 ? (1 - bounceOut(1 - 2 * x)) / 2 : (1 + bounceOut(2 * x - 1)) / 2,
};

/** A spring preset's tension/friction pair. */
export interface SpringPreset {
	readonly tension: number;
	readonly friction: number;
}

/**
 * Ripple's named spring presets. Frozen: `spring.configure(config.stiff)` must
 * never be able to edit the preset every other component shares — a mutation
 * here would retune the whole app.
 */
export const config: Record<
	| "default"
	| "gentle"
	| "wobbly"
	| "stiff"
	| "slow"
	| "molasses"
	| "figmaGentle"
	| "figmaQuick"
	| "figmaBouncy"
	| "figmaSlow",
	SpringPreset
> = {
	default: Object.freeze({ tension: 170, friction: 26 }),
	gentle: Object.freeze({ tension: 120, friction: 14 }),
	wobbly: Object.freeze({ tension: 180, friction: 12 }),
	stiff: Object.freeze({ tension: 210, friction: 20 }),
	slow: Object.freeze({ tension: 280, friction: 60 }),
	molasses: Object.freeze({ tension: 280, friction: 120 }),
	figmaGentle: Object.freeze({ tension: 100, friction: 15 }),
	figmaQuick: Object.freeze({ tension: 300, friction: 20 }),
	figmaBouncy: Object.freeze({ tension: 600, friction: 15 }),
	figmaSlow: Object.freeze({ tension: 80, friction: 20 }),
};
