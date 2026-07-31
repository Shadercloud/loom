/**
 * Oklab conversion, ported from Ripple's `utils/oklab.luau` (Björn Ottosson,
 * https://bottosson.github.io/posts/oklab/ — MIT).
 *
 * Ripple interpolates `Color3` in Oklab rather than sRGB, so a fade between two
 * colors keeps perceived lightness instead of dipping through mud. The port is
 * component-for-component faithful: a spring over a color in loom must land on
 * the same values it would in Roblox.
 */

type Triple = readonly [number, number, number];

/** sRGB companding (linear → sRGB). */
function gamma(x: number): number {
	return x >= 0.0031308 ? 1.055 * x ** (1 / 2.4) - 0.055 : 12.92 * x;
}

/** Inverse sRGB companding (sRGB → linear). */
function gammaInv(x: number): number {
	return x >= 0.04045 ? ((x + 0.055) / 1.055) ** 2.4 : x / 12.92;
}

/** Real cube root (`(-8) ** (1/3)` is NaN in JS, so the sign is split out). */
function cbrt(x: number): number {
	return x >= 0 ? x ** (1 / 3) : -((-x) ** (1 / 3));
}

function dot(a: Triple, b: Triple): number {
	return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** sRGB (0..1 per channel) → Oklab. */
export function fromSRGB(srgb: Triple): Triple {
	const rgb: Triple = [gammaInv(srgb[0]), gammaInv(srgb[1]), gammaInv(srgb[2])];
	const lmsRoot: Triple = [
		cbrt(dot([0.4122214708, 0.5363325363, 0.0514459929], rgb)),
		cbrt(dot([0.2119034982, 0.6806995451, 0.1073969566], rgb)),
		cbrt(dot([0.0883024619, 0.2817188376, 0.6299787005], rgb)),
	];
	return [
		dot([0.2104542553, 0.793617785, -0.0040720468], lmsRoot),
		dot([1.9779984951, -2.428592205, 0.4505937099], lmsRoot),
		dot([0.0259040371, 0.7827717662, -0.808675766], lmsRoot),
	];
}

/** Oklab → sRGB (0..1 per channel; may overshoot, callers clamp at zero). */
export function toSRGB(lab: Triple): Triple {
	const lmsRoot: Triple = [
		dot([1, 0.3963377774, 0.2158037573], lab),
		dot([1, -0.1055613458, -0.0638541728], lab),
		dot([1, -0.0894841775, -1.291485548], lab),
	];
	const lms: Triple = [lmsRoot[0] ** 3, lmsRoot[1] ** 3, lmsRoot[2] ** 3];
	return [
		gamma(dot([4.0767416621, -3.3077115913, 0.2309699292], lms)),
		gamma(dot([-1.2684380046, 2.6097574011, -0.3413193965], lms)),
		gamma(dot([-0.0041960863, -0.7034186147, 1.707614701], lms)),
	];
}
