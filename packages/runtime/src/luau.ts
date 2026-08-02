/**
 * `luau.ts` — the Luau global environment roblox-ts output expects.
 *
 * `typeIs`/`typeOf`, `pcall` (array-tuple `[ok, ...results]`), `pairs`/`ipairs`
 * generators, `select` and the `raw*` accessors, the `math`/`string`/`table`/
 * `os`/`bit32`/`utf8`/`buffer`/`debug` libraries (Luau's 1-based positions and
 * all), an inert `coroutine`, the `task` scheduler (with cancelable
 * `task.delay`), and the guarded prototype patches roblox-ts macro methods
 * compile to (`Array.prototype.size()`, `.remove()`, `String.prototype.size()`).
 * `installGlobals` in `index.ts` wires all of this onto `globalThis` before
 * preview app code runs.
 *
 * What is deliberately absent is `setmetatable`/`getmetatable`/`newproxy`:
 * loom runs the author's TypeScript, whose classes are JS classes, and there is
 * no faithful way to give a plain JS object a metatable's `__index`/`__newindex`
 * behaviour without proxying every table in the program.
 */
import {
	CFrame,
	Color3,
	ColorSequence,
	ColorSequenceKeypoint,
	Rect,
	TweenInfo,
	UDim,
	UDim2,
	Vector2,
	Vector3,
} from "./datatypes";
import { EnumItem } from "./enums";
import { isLoomInstance } from "./instance";

// --- type reflection ---------------------------------------------------------

/** Luau `typeof()` — recognizes loom datatypes, enum items, and instances. */
export function typeOf(value: unknown): string {
	if (value === undefined || value === null) return "nil";
	if (isLoomInstance(value)) return "Instance";
	if (value instanceof UDim) return "UDim";
	if (value instanceof UDim2) return "UDim2";
	if (value instanceof Vector2) return "Vector2";
	if (value instanceof Vector3) return "Vector3";
	if (value instanceof Color3) return "Color3";
	if (value instanceof ColorSequence) return "ColorSequence";
	if (value instanceof ColorSequenceKeypoint) return "ColorSequenceKeypoint";
	if (value instanceof Rect) return "Rect";
	if (value instanceof CFrame) return "CFrame";
	if (value instanceof TweenInfo) return "TweenInfo";
	if (value instanceof EnumItem) return "EnumItem";
	// Declared further down the file; a class in TDZ is fine to name here,
	// because `typeOf` only ever runs after the module has finished evaluating.
	if (value instanceof LuauBuffer) return "buffer";
	const t = typeof value;
	if (t === "object") return "table";
	return t; // "string" | "number" | "boolean" | "function" | …
}

/** roblox-ts `typeIs(value, "Vector2")` type guard. */
export function typeIs(value: unknown, typeName: string): boolean {
	return typeOf(value) === typeName;
}

// --- error handling ----------------------------------------------------------

/**
 * Luau `pcall` as roblox-ts emits it: returns the `[ok, ...results]` array
 * tuple. Thrown `Error`s surface as their message (Luau errors are strings).
 */
export function pcall<A extends unknown[], R>(
	fn: (...args: A) => R,
	...args: A
): [true, R] | [false, unknown] {
	try {
		return [true, fn(...args)];
	} catch (err) {
		return [false, err instanceof Error ? err.message : err];
	}
}

/** Luau `xpcall` — like `pcall`, but failures run through `handler` first. */
export function xpcall<A extends unknown[], R, H>(
	fn: (...args: A) => R,
	handler: (err: unknown) => H,
	...args: A
): [true, R] | [false, H] {
	try {
		return [true, fn(...args)];
	} catch (err) {
		return [false, handler(err instanceof Error ? err.message : err)];
	}
}

/** Luau `error(message)` — throws the value (`level` is accepted, unused). */
export function error(message?: unknown, _level?: number): never {
	throw message;
}

/** Luau `warn` → `console.warn`. */
export function warn(...args: unknown[]): void {
	console.warn(...args);
}

/** Luau `print` → `console.log`. */
export function print(...args: unknown[]): void {
	console.log(...args);
}

/** Luau `tostring` — `nil` for nullish, `Enum.X.Y` for enum items. */
export function tostring(value: unknown): string {
	if (value === undefined || value === null) return "nil";
	return String(value);
}

/** Luau `tonumber` — `undefined` (nil) when the value isn't numeric. */
export function tonumber(value: unknown, base?: number): number | undefined {
	if (base !== undefined) {
		if (typeof value !== "string") return undefined;
		const parsed = Number.parseInt(value.trim(), base);
		return Number.isNaN(parsed) ? undefined : parsed;
	}
	if (typeof value === "number") return value;
	if (typeof value === "string") {
		const trimmed = value.trim();
		if (trimmed === "") return undefined;
		const parsed = Number(trimmed);
		return Number.isNaN(parsed) ? undefined : parsed;
	}
	return undefined;
}

// --- iteration ---------------------------------------------------------------

/**
 * Luau `pairs` as roblox-ts uses it: `for (const [k, v] of pairs(obj))`.
 * Maps iterate entries, arrays iterate 1-based indices, plain objects iterate
 * own string keys. `undefined` values are skipped (they are Luau `nil`).
 */
export function pairs<K, V>(value: ReadonlyMap<K, V>): IterableIterator<[K, V]>;
export function pairs<V>(value: readonly V[]): IterableIterator<[number, V]>;
export function pairs<T extends object>(
	value: T,
): IterableIterator<[string, T[keyof T]]>;
export function* pairs(value: object): IterableIterator<[unknown, unknown]> {
	if (value instanceof Map) {
		yield* value.entries();
		return;
	}
	if (Array.isArray(value)) {
		for (let i = 0; i < value.length; i++) {
			if (value[i] !== undefined) yield [i + 1, value[i]];
		}
		return;
	}
	for (const key of Object.keys(value)) {
		const v = (value as Record<string, unknown>)[key];
		if (v !== undefined) yield [key, v];
	}
}

/**
 * Luau `next(t, key?)` — the raw table iterator. roblox-ts code uses the no-key
 * form as an emptiness probe (`next(t)[0] !== undefined`); the keyed form
 * returns the pair after `key` in iteration order. Exhaustion yields
 * `[undefined]`.
 */
export function next(
	value: object,
	key?: unknown,
): [unknown, unknown] | [undefined] {
	const entries: [unknown, unknown][] = [
		...pairs(value as Record<string, unknown>),
	];
	if (key === undefined) {
		const first = entries[0];
		return first ?? [undefined];
	}
	const index = entries.findIndex(([k]) => k === key);
	const following = index === -1 ? undefined : entries[index + 1];
	return following ?? [undefined];
}

/** Luau `ipairs` — 1-based indices, stops at the first `nil` hole. */
export function* ipairs<V>(value: readonly V[]): IterableIterator<[number, V]> {
	for (let i = 0; i < value.length; i++) {
		const v = value[i];
		if (v === undefined) return;
		yield [i + 1, v];
	}
}

// --- math --------------------------------------------------------------------

/**
 * The seeded stream `math.randomseed` switches `math.random` over to, or
 * `undefined` while it still runs off `Math.random`.
 *
 * `Math.random` cannot be seeded, and a `randomseed` that quietly did nothing
 * would leave code that seeds *for reproducibility* — a shuffle in a test, a
 * demo that wants the same layout every load — silently unreproducible. So
 * seeding installs a small deterministic generator (mulberry32) instead. The
 * numbers are loom's own, not the engine's: same seed, same sequence, here.
 */
let randomState: number | undefined;

function nextRandom(): number {
	if (randomState === undefined) return Math.random();
	randomState = (randomState + 0x6d2b79f5) | 0;
	let t = randomState;
	t = Math.imul(t ^ (t >>> 15), t | 1);
	t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** The Luau `math` library (browser subset). */
export const math = {
	abs: Math.abs,
	floor: Math.floor,
	ceil: Math.ceil,
	sqrt: Math.sqrt,
	max: Math.max,
	min: Math.min,
	pow: Math.pow,
	exp: Math.exp,
	sin: Math.sin,
	cos: Math.cos,
	tan: Math.tan,
	asin: Math.asin,
	acos: Math.acos,
	atan: Math.atan,
	atan2: Math.atan2,
	sinh: Math.sinh,
	cosh: Math.cosh,
	tanh: Math.tanh,
	log10: Math.log10,
	sign: Math.sign,
	huge: Number.POSITIVE_INFINITY,
	pi: Math.PI,
	/** `math.log(x)` is natural; `math.log(x, base)` is in that base. */
	log(x: number, base?: number): number {
		return base === undefined ? Math.log(x) : Math.log(x) / Math.log(base);
	},
	/** `math.ldexp(m, e)` — `m * 2^e`, the inverse of {@link math.frexp}. */
	ldexp(m: number, e: number): number {
		return m * 2 ** Math.trunc(e);
	},
	/**
	 * `math.frexp` — the `[mantissa, exponent]` tuple with
	 * `value === mantissa * 2^exponent` and `0.5 <= |mantissa| < 1`. Zero and
	 * the non-finite values come back unchanged, with exponent 0.
	 */
	frexp(value: number): [number, number] {
		if (value === 0 || !Number.isFinite(value)) return [value, 0];
		let exponent = Math.ceil(Math.log2(Math.abs(value)));
		let mantissa = value / 2 ** exponent;
		// log2 is a float, so nudge the pair until it really is in range.
		while (Math.abs(mantissa) >= 1) {
			mantissa /= 2;
			exponent += 1;
		}
		while (Math.abs(mantissa) < 0.5) {
			mantissa *= 2;
			exponent -= 1;
		}
		return [mantissa, exponent];
	},
	/** `math.modf` — the `[integral, fractional]` tuple, both signed like `x`. */
	modf(x: number): [number, number] {
		const integral = x >= 0 ? Math.floor(x) : Math.ceil(x);
		return [integral, Number.isFinite(x) ? x - integral : 0];
	},
	clamp(value: number, min: number, max: number): number {
		return Math.min(Math.max(value, min), max);
	},
	/** Luau rounds halves away from zero (`Math.round` rounds toward +∞). */
	round(value: number): number {
		return value >= 0 ? Math.floor(value + 0.5) : Math.ceil(value - 0.5);
	},
	fmod(a: number, b: number): number {
		return a % b;
	},
	deg(radians: number): number {
		return (radians * 180) / Math.PI;
	},
	rad(degrees: number): number {
		return (degrees * Math.PI) / 180;
	},
	/** Deterministic stub — previews don't need Perlin noise. */
	noise(): number {
		return 0;
	},
	random(m?: number, n?: number): number {
		if (m === undefined) return nextRandom();
		if (n === undefined) return Math.floor(nextRandom() * m) + 1;
		return Math.floor(nextRandom() * (n - m + 1)) + m;
	},
	/** `math.randomseed` — makes {@link math.random} deterministic; see above. */
	randomseed(seed: number): void {
		randomState = Math.trunc(seed) | 0;
	},
};

// --- string ------------------------------------------------------------------

function escapeRegExpChar(c: string): string {
	return /[.*+?^${}()|[\]\\/]/.test(c) ? `\\${c}` : c;
}

function escapeRegExpSetChar(c: string): string {
	return /[\\\]^[-]/.test(c) ? `\\${c}` : c;
}

function luaClass(c: string, inSet: boolean): string | undefined {
	switch (c) {
		case "a":
			return inSet ? "A-Za-z" : "[A-Za-z]";
		case "d":
			return inSet ? "0-9" : "[0-9]";
		case "l":
			return inSet ? "a-z" : "[a-z]";
		case "u":
			return inSet ? "A-Z" : "[A-Z]";
		case "w":
			return inSet ? "A-Za-z0-9" : "[A-Za-z0-9]";
		case "s":
			return inSet ? "\\s" : "[\\s]";
		default:
			return undefined;
	}
}

/**
 * Convert the supported Lua pattern subset (literals, `%w`-style classes,
 * bracket sets, `.`, `+*-?` quantifiers, edge anchors) to a RegExp. Returns
 * `undefined` for anything richer — callers fall back to literal matching.
 */
function luaPatternToRegExp(pattern: string): RegExp | undefined {
	let out = "";
	let i = 0;
	while (i < pattern.length) {
		const ch = pattern.charAt(i);
		if (ch === "%") {
			const next = pattern.charAt(i + 1);
			if (next === "") return undefined;
			if (/[a-z]/.test(next)) {
				const cls = luaClass(next, false);
				if (cls === undefined) return undefined; // %b, %f, … unsupported
				out += cls;
			} else if (/[A-Z]/.test(next)) {
				return undefined; // negated classes unsupported
			} else {
				out += escapeRegExpChar(next); // %-, %., %% → literal
			}
			i += 2;
		} else if (ch === "[") {
			let set = "[";
			i += 1;
			if (pattern.charAt(i) === "^") {
				set += "^";
				i += 1;
			}
			let closed = false;
			while (i < pattern.length) {
				const c = pattern.charAt(i);
				if (c === "]") {
					closed = true;
					i += 1;
					break;
				}
				if (c === "%") {
					const next = pattern.charAt(i + 1);
					if (next === "") return undefined;
					if (/[a-z]/.test(next)) {
						const cls = luaClass(next, true);
						if (cls === undefined) return undefined;
						set += cls;
					} else if (/[A-Z]/.test(next)) {
						return undefined;
					} else {
						set += escapeRegExpSetChar(next);
					}
					i += 2;
				} else {
					set += c === "\\" ? "\\\\" : c;
					i += 1;
				}
			}
			if (!closed) return undefined;
			out += `${set}]`;
		} else if (ch === "-") {
			out += "*?"; // Lua's lazy repetition
			i += 1;
		} else if (ch === "^") {
			if (i !== 0) return undefined;
			out += "^";
			i += 1;
		} else if (ch === "$" && i === pattern.length - 1) {
			out += "$";
			i += 1;
		} else if ("().*+?".includes(ch)) {
			out += ch; // same meaning in both dialects
			i += 1;
		} else {
			out += escapeRegExpChar(ch);
			i += 1;
		}
	}
	try {
		return new RegExp(out, "g");
	} catch {
		return undefined;
	}
}

function escapeWholePattern(pattern: string): RegExp {
	return new RegExp(pattern.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&"), "g");
}

/**
 * The 0-based JS offset a 1-based Luau `init` argument names. Negative values
 * count back from the end, as they do in the engine.
 */
function searchStart(init: number, length: number): number {
	const at = Math.trunc(init);
	if (at < 0) return Math.max(length + at, 0);
	return Math.min(Math.max(at, 1) - 1, length);
}

/** The captures a match yields, or the whole match when the pattern has none. */
function captures(match: RegExpExecArray): string[] {
	if (match.length <= 1) return [match[0]];
	return match.slice(1).map((capture) => capture ?? "");
}

/**
 * The Luau `string` library (browser subset; indices are 1-based).
 *
 * Luau strings are byte strings and JS strings are sequences of UTF-16 code
 * units, so `len`, `byte` and the indices everything here takes count code
 * units, not bytes. The two agree exactly on ASCII, which is what UI source
 * measures and slices; beyond it, loom counts what the string it was handed
 * actually contains (see {@link utf8} for the code-point view).
 */
export const string = {
	lower(s: string): string {
		return s.toLowerCase();
	},
	upper(s: string): string {
		return s.toUpperCase();
	},
	/** `string.len` — see the note above on code units vs bytes. */
	len(s: string): number {
		return s.length;
	},
	/** `string.reverse` — by code point, so a surrogate pair survives it. */
	reverse(s: string): string {
		return Array.from(s).reverse().join("");
	},
	/** `string.char` — the characters for the given codes. */
	char(...codes: number[]): string {
		return String.fromCharCode(...codes);
	},
	/**
	 * `string.byte` — the codes of `s[i..j]` (`j` defaults to `i`, so the common
	 * call yields one). A tuple, so `const [b] = string.byte(s)` reads it.
	 */
	byte(s: string, i = 1, j: number = i): number[] {
		const len = s.length;
		const start = i < 0 ? Math.max(len + i + 1, 1) : Math.max(Math.trunc(i), 1);
		const end = j < 0 ? len + j + 1 : Math.min(Math.trunc(j), len);
		const codes: number[] = [];
		for (let k = start; k <= end; k++) codes.push(s.charCodeAt(k - 1));
		return codes;
	},
	/** `string.sub` — 1-based inclusive, negative indices count from the end. */
	sub(s: string, i = 1, j = -1): string {
		const len = s.length;
		const start = i < 0 ? Math.max(len + i + 1, 1) : Math.max(i, 1);
		const end = j < 0 ? len + j + 1 : Math.min(j, len);
		if (start > end) return "";
		return s.slice(start - 1, end);
	},
	rep(s: string, n: number, sep = ""): string {
		if (n <= 0) return "";
		return new Array<string>(Math.floor(n)).fill(s).join(sep);
	},
	split(s: string, sep = ","): string[] {
		return s.split(sep);
	},
	/**
	 * `string.find` — returns the 1-based `[start, end]` tuple, or an EMPTY tuple
	 * when there is no match. Non-plain calls try the pattern subset, then fall
	 * back to a literal find.
	 *
	 * The empty tuple (not `undefined`) is what keeps roblox-ts callers working:
	 * `string.find` is a `LuaTuple`, so the idiomatic read is
	 * `const [start] = string.find(...)`. Destructuring `undefined` throws
	 * "undefined is not iterable" in JS, whereas Luau happily destructures a nil
	 * multi-return into nils — an empty array reproduces that, and matches
	 * roblox-ts's other semantics too (an undestructured multi-return is a table,
	 * i.e. always truthy).
	 */
	find(
		s: string,
		pattern: string,
		init = 1,
		plain = false,
	): [number, number] | [] {
		const from = searchStart(init, s.length);
		if (!plain) {
			const re = luaPatternToRegExp(pattern);
			if (re) {
				re.lastIndex = from;
				const match = re.exec(s);
				return match ? [match.index + 1, match.index + match[0].length] : [];
			}
		}
		const index = s.indexOf(pattern, from);
		return index >= 0 ? [index + 1, index + pattern.length] : [];
	},
	/**
	 * `string.gsub` — returns the `[result, count]` tuple. Supports the same
	 * pattern subset as `find` and treats richer patterns as literal text.
	 * `%0`/`%1`… in the replacement reference the match and its captures.
	 */
	gsub(
		s: string,
		pattern: string,
		repl: string,
		maxCount?: number,
	): [string, number] {
		const limit = maxCount ?? Number.POSITIVE_INFINITY;
		const re = luaPatternToRegExp(pattern) ?? escapeWholePattern(pattern);
		let count = 0;
		const result = s.replace(re, (...args) => {
			const match = args[0] as string;
			if (count >= limit) return match;
			count += 1;
			const groups = args.slice(1, -2) as (string | undefined)[];
			return repl.replace(/%([0-9%])/g, (_m, d: string) => {
				if (d === "%") return "%";
				if (d === "0") return match;
				return groups[Number(d) - 1] ?? "";
			});
		});
		return [result, count];
	},
	/**
	 * `string.match` — the pattern's captures, or the whole match when it has
	 * none, as the tuple roblox-ts reads (`const [word] = string.match(…)`). An
	 * unmatched call is the EMPTY tuple, for the reason spelled out on `find`.
	 */
	match(s: string, pattern: string, init = 1): string[] {
		const from = searchStart(init, s.length);
		const re = luaPatternToRegExp(pattern);
		if (re) {
			re.lastIndex = from;
			const found = re.exec(s);
			return found ? captures(found) : [];
		}
		return s.indexOf(pattern, from) >= 0 ? [pattern] : [];
	},
	/**
	 * `string.gmatch` — iterates every match, yielding its captures the way
	 * `match` returns them, so `for (const [k, v] of string.gmatch(s, …))` works.
	 */
	*gmatch(s: string, pattern: string): IterableIterator<string[]> {
		const re = luaPatternToRegExp(pattern) ?? escapeWholePattern(pattern);
		re.lastIndex = 0;
		let found = re.exec(s);
		while (found) {
			yield captures(found);
			// A zero-width match would otherwise spin on the same offset forever.
			if (found[0] === "") re.lastIndex += 1;
			found = re.exec(s);
		}
	},
	/** `string.format` — supports `%d %s %f %x %X %%` and `%.Nf`. */
	format(fmt: string, ...args: unknown[]): string {
		let argIndex = 0;
		return fmt.replace(
			/%(?:(%)|(?:\.(\d+))?([dsfxX]))/g,
			(match, pct: string | undefined, prec: string | undefined, spec) => {
				if (pct) return "%";
				const arg = args[argIndex];
				argIndex += 1;
				switch (spec) {
					case "d":
						return String(Math.trunc(Number(arg)));
					case "s":
						return tostring(arg);
					case "f":
						return Number(arg).toFixed(prec !== undefined ? Number(prec) : 6);
					case "x":
						return (Math.trunc(Number(arg)) >>> 0).toString(16);
					case "X":
						return (Math.trunc(Number(arg)) >>> 0).toString(16).toUpperCase();
					default:
						return match;
				}
			},
		);
	},
};

// --- table -------------------------------------------------------------------

/** Luau positions are 1-based integers; clamp one into `[1, limit]`. */
function position(value: number, limit: number): number {
	return Math.min(Math.max(Math.trunc(value), 1), limit);
}

/**
 * `table.foreach` — `f(key, value)` over every pair, stopping at the first
 * non-`nil` return and handing it back. Declared out here, like {@link pairs},
 * because overloads are what give the callback real key and value types, and an
 * object literal method cannot carry them.
 */
function tableForeach<V, R>(
	list: readonly V[],
	callback: (key: number, value: V) => R,
): R | undefined;
function tableForeach<K, V, R>(
	map: ReadonlyMap<K, V>,
	callback: (key: K, value: V) => R,
): R | undefined;
function tableForeach<T extends object, R>(
	t: T,
	callback: (key: string, value: T[keyof T]) => R,
): R | undefined;
function tableForeach(
	t: object,
	callback: (key: never, value: never) => unknown,
): unknown {
	const visit = callback as (key: unknown, value: unknown) => unknown;
	for (const [key, value] of pairs(t as Record<string, unknown>)) {
		const result = visit(key, value);
		if (result !== undefined) return result;
	}
	return undefined;
}

/** `table.foreachi` — {@link tableForeach} over the array part only. */
function tableForeachi<V, R>(
	list: readonly V[],
	callback: (index: number, value: V) => R,
): R | undefined {
	for (const [index, value] of ipairs(list)) {
		const result = callback(index, value);
		if (result !== undefined) return result;
	}
	return undefined;
}

/**
 * The Luau `table` library (browser subset).
 *
 * **Positions are 1-based**, exactly as they are in Luau, because this library
 * is not a roblox-ts macro — the compiler passes the arguments straight through
 * to the engine, so the number a roblox-ts author writes is already a Luau
 * index. `string.find` above returns 1-based indices for the same reason. Note
 * the deliberate contrast with the array *methods* roblox-ts does compile as
 * macros (`arr.remove(i)`, patched onto `Array.prototype` below): those are
 * 0-based on the TS side, and `table.remove(arr, i)` is not.
 *
 * The tables themselves are ordinary JS values — an array, a `Map`, a `Set`, or
 * a plain object — so `#list` is `list.length` and a hole does not end it.
 *
 * Deviations from the engine, all in the forgiving direction (a preview should
 * render, not crash, over an off-by-one):
 *
 * - an out-of-range `insert` position clamps instead of erroring, and an
 *   out-of-range `remove` position returns `nil` without mutating;
 * - `concat` runs every element through {@link tostring} rather than erroring on
 *   a non-string, non-number one;
 * - `freeze` is `Object.freeze`, which stops writes to an array or an object but
 *   cannot stop `Map.set` / `Set.add`.
 */
export const table = {
	/** `table.insert(list, value)` / `table.insert(list, pos, value)`. */
	insert<T>(list: T[], ...rest: [value: T] | [pos: number, value: T]): void {
		if (rest.length === 1) {
			list.push(rest[0]);
			return;
		}
		const [pos, value] = rest;
		list.splice(position(pos, list.length + 1) - 1, 0, value);
	},
	/** `table.remove` — removes and returns `list[pos]` (default: the last). */
	remove<T>(list: T[], pos: number = list.length): T | undefined {
		const at = Math.trunc(pos);
		if (at < 1 || at > list.length) return undefined;
		return list.splice(at - 1, 1)[0];
	},
	/** `table.find` — the 1-based index of `needle`, or `nil` when absent. */
	find<T>(haystack: readonly T[], needle: T, init = 1): number | undefined {
		for (
			let i = position(init, haystack.length + 1) - 1;
			i < haystack.length;
			i++
		) {
			if (haystack[i] === needle) return i + 1;
		}
		return undefined;
	},
	/** `table.concat` — joins `list[i..j]` (inclusive) with `sep`. */
	concat(
		list: readonly unknown[],
		sep = "",
		i = 1,
		j: number = list.length,
	): string {
		const start = position(i, list.length + 1);
		const end = Math.min(Math.trunc(j), list.length);
		const parts: string[] = [];
		for (let k = start; k <= end; k++) parts.push(tostring(list[k - 1]));
		return parts.join(sep);
	},
	/**
	 * `table.sort` — in place, with Luau's *predicate* comparator: `comp(a, b)`
	 * is true when `a` must come before `b` (JS wants a number, hence the
	 * translation). The default order is `<`, as it is in Luau.
	 */
	sort<T>(list: T[], comp?: (a: T, b: T) => boolean): void {
		const before =
			comp ??
			((a: T, b: T) => (a as unknown as number) < (b as unknown as number));
		list.sort((a, b) => (before(a, b) ? -1 : before(b, a) ? 1 : 0));
	},
	/** `table.create` — an array of `count` copies of `value`. */
	create<T>(count: number, value?: T): T[] {
		return new Array<T>(Math.max(Math.trunc(count), 0)).fill(value as T);
	},
	/** `table.clear` — empties the table, keeping the same reference. */
	clear(value: object): void {
		if (Array.isArray(value)) {
			value.length = 0;
			return;
		}
		if (value instanceof Map || value instanceof Set) {
			value.clear();
			return;
		}
		for (const key of Object.keys(value)) {
			delete (value as Record<string, unknown>)[key];
		}
	},
	/** `table.clone` — a shallow copy of the same shape. */
	clone<T extends object>(value: T): T {
		if (Array.isArray(value)) return value.slice() as unknown as T;
		if (value instanceof Map) return new Map(value) as unknown as T;
		if (value instanceof Set) return new Set(value) as unknown as T;
		return Object.assign(
			Object.create(Object.getPrototypeOf(value) as object | null),
			value,
		) as T;
	},
	/** `table.freeze` — shallow, and returns the table it froze. */
	freeze<T extends object>(value: T): T {
		return Object.freeze(value);
	},
	/** `table.isfrozen`. */
	isfrozen(value: object): boolean {
		return Object.isFrozen(value);
	},
	/**
	 * `table.unpack` — `list[i..j]` as the array roblox-ts reads a `LuaTuple` as
	 * (`const [a, b] = table.unpack(list)`).
	 */
	unpack<T>(list: readonly T[], i = 1, j: number = list.length): T[] {
		const start = position(i, list.length + 1);
		const end = Math.min(Math.trunc(j), list.length);
		return list.slice(start - 1, Math.max(end, 0));
	},
	/** `table.pack` — the arguments as an array carrying their count as `n`. */
	pack<T>(...values: T[]): T[] & { n: number } {
		const packed = values as T[] & { n: number };
		packed.n = values.length;
		return packed;
	},
	/**
	 * `table.move` — copies `src[a..b]` into `dst` starting at `t` (in `src`
	 * itself when `dst` is omitted) and returns `dst`. Overlapping ranges are
	 * safe: the source range is read out before anything is written.
	 */
	move<T>(
		src: readonly T[],
		a: number,
		b: number,
		t: number,
		dst: T[] = src as T[],
	): T[] {
		const from = Math.trunc(a);
		const to = Math.trunc(b);
		if (to < from) return dst;
		const moved = src.slice(Math.max(from, 1) - 1, Math.max(to, 0));
		const at = Math.max(Math.trunc(t), 1);
		for (let k = 0; k < moved.length; k++) dst[at - 1 + k] = moved[k] as T;
		return dst;
	},

	// The Lua 5.1 leftovers Roblox still exposes. Deprecated there, and so
	// deprecated here — but old roblox-ts code does call them, and a preview that
	// throws `table.getn is not a function` teaches the author nothing.

	/** @deprecated `table.getn(list)` — `#list`. Use `list.size()`. */
	getn(list: readonly unknown[]): number {
		return list.length;
	},
	/**
	 * @deprecated `table.maxn(t)` — the largest positive index holding a value, or
	 * 0. Unlike `getn` it looks past holes, and it reads numeric keys off a `Map`
	 * or an object too.
	 */
	maxn(t: object): number {
		if (Array.isArray(t)) {
			for (let i = t.length - 1; i >= 0; i--) {
				if (t[i] !== undefined) return i + 1;
			}
			return 0;
		}
		let max = 0;
		for (const [key, value] of pairs(t as Record<string, unknown>)) {
			const index = typeof key === "number" ? key : Number(key);
			if (value !== undefined && Number.isFinite(index) && index > max) {
				max = index;
			}
		}
		return max;
	},
	/** @deprecated `table.foreach` — see {@link tableForeach}. */
	foreach: tableForeach,
	/** @deprecated `table.foreachi` — see {@link tableForeachi}. */
	foreachi: tableForeachi,
};

// --- raw access / varargs ----------------------------------------------------

/**
 * Luau `select` — `select("#", …)` counts the varargs, `select(n, …)` returns
 * them from the nth on (negative `n` counts back from the last), as the array
 * roblox-ts reads a `LuaTuple` as.
 */
export function select(index: "#", ...values: unknown[]): number;
export function select<T>(index: number, ...values: T[]): T[];
export function select<T>(index: number | "#", ...values: T[]): number | T[] {
	if (index === "#") return values.length;
	const at = Math.trunc(index);
	const start = at < 0 ? values.length + at : at - 1;
	return values.slice(Math.max(start, 0));
}

/**
 * Luau `unpack` — the deprecated global alias of {@link table.unpack}, still
 * exposed by the engine and still called by older code.
 *
 * @deprecated Use `table.unpack`.
 */
export function unpack<T>(list: readonly T[], i?: number, j?: number): T[] {
	return table.unpack(list, i, j);
}

/**
 * The `raw*` globals, which in Luau read and write a table without consulting
 * its metatable. Loom's tables are ordinary JS values with no metatables at all
 * (see the note on `setmetatable` in the README), so "raw" and "cooked" access
 * are the same thing here — these exist so code that spells the raw form still
 * runs, and they behave exactly like the plain access it is asking for.
 *
 * The key is taken as written. For a dictionary or a `Map` that is exact; on an
 * array, roblox-ts's own TS-side key (0-based) and the Luau one (1-based)
 * disagree, and loom follows the source it is actually running — the TS one.
 */
export function rawget<T extends object, K extends keyof T>(t: T, key: K): T[K];
export function rawget<K, V>(t: ReadonlyMap<K, V>, key: K): V | undefined;
export function rawget(t: object, key: unknown): unknown {
	if (t instanceof Map) return t.get(key);
	return (t as Record<string | number, unknown>)[key as string | number];
}

/** `rawset(t, key, value)` — the plain write; returns the table. */
export function rawset<T extends object, K extends keyof T>(
	t: T,
	key: K,
	value: T[K],
): T;
export function rawset<K, V>(t: Map<K, V>, key: K, value: V): Map<K, V>;
export function rawset(t: object, key: unknown, value: unknown): object {
	if (t instanceof Map) {
		t.set(key, value);
		return t;
	}
	(t as Record<string | number, unknown>)[key as string | number] = value;
	return t;
}

/** `rawequal(a, b)` — identity, with no `__eq` to consult. */
export function rawequal(a: unknown, b: unknown): boolean {
	return a === b;
}

/**
 * `rawlen(t)` — `#t` with no `__len` to consult: an array's length, a `Map`'s or
 * `Set`'s size, an object's own-key count, a string's length.
 */
export function rawlen(t: object | string): number {
	if (typeof t === "string") return t.length;
	if (Array.isArray(t)) return t.length;
	if (t instanceof Map || t instanceof Set) return t.size;
	return Object.keys(t).length;
}

// --- os / coroutine ----------------------------------------------------------

/** The table `os.date("*t")` returns, and the one `os.time` accepts. */
export interface DateTable {
	year: number;
	month: number;
	day: number;
	hour?: number;
	min?: number;
	sec?: number;
	/** 1 = Sunday. Read from `os.date`; ignored by `os.time`. */
	wday?: number;
	/** Day of the year, 1-based. Read from `os.date`; ignored by `os.time`. */
	yday?: number;
	isdst?: boolean;
}

const WEEKDAYS = [
	"Sunday",
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday",
];
const MONTHS = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
];

function pad(value: number, width = 2): string {
	return String(Math.abs(value)).padStart(width, "0");
}

/** The `os.date` field readers, in local time or UTC. */
function dateParts(date: Date, utc: boolean) {
	return utc
		? {
				year: date.getUTCFullYear(),
				month: date.getUTCMonth() + 1,
				day: date.getUTCDate(),
				hour: date.getUTCHours(),
				min: date.getUTCMinutes(),
				sec: date.getUTCSeconds(),
				wday: date.getUTCDay() + 1,
			}
		: {
				year: date.getFullYear(),
				month: date.getMonth() + 1,
				day: date.getDate(),
				hour: date.getHours(),
				min: date.getMinutes(),
				sec: date.getSeconds(),
				wday: date.getDay() + 1,
			};
}

/** The Luau `os` library (browser subset). */
export const os = {
	/** CPU-ish time in seconds (monotonic time since page load). */
	clock(): number {
		return performance.now() / 1000;
	},
	/**
	 * `os.time()` — Unix time in whole seconds. Given a date table it converts
	 * that instead, reading the fields as **UTC** (as the engine does) and
	 * defaulting `hour` to 12, `min`/`sec` to 0, exactly like Lua.
	 */
	time(t?: DateTable): number {
		if (t === undefined) return Math.floor(Date.now() / 1000);
		return Math.floor(
			Date.UTC(
				t.year,
				t.month - 1,
				t.day,
				t.hour ?? 12,
				t.min ?? 0,
				t.sec ?? 0,
			) / 1000,
		);
	},
	/** `os.difftime(t2, t1)` — seconds between two `os.time` values. */
	difftime(t2: number, t1: number): number {
		return t2 - t1;
	},
	/**
	 * `os.date([format], [time])` — formats `time` (default: now).
	 *
	 * A leading `!` reads the clock as UTC instead of local time. `"*t"` (or
	 * `"!*t"`) returns a {@link DateTable} rather than a string; anything else is
	 * a strftime-style format over the specifiers Roblox code uses: `%a %A %b %B
	 * %c %d %H %I %j %m %M %p %S %x %X %y %Y %%`. An unknown specifier is left
	 * as written rather than guessed at.
	 */
	date(format = "%c", time?: number): string | DateTable {
		const utc = format.startsWith("!");
		const spec = utc ? format.slice(1) : format;
		const date = new Date((time ?? os.time()) * 1000);
		const parts = dateParts(date, utc);
		if (spec === "*t") {
			const startOfYear = utc
				? Date.UTC(parts.year, 0, 1)
				: new Date(parts.year, 0, 1).getTime();
			const dayMs = 86_400_000;
			return {
				...parts,
				yday: Math.floor((date.getTime() - startOfYear) / dayMs) + 1,
				isdst: false,
			};
		}
		const hour12 = parts.hour % 12 === 0 ? 12 : parts.hour % 12;
		const weekday = WEEKDAYS[parts.wday - 1] ?? "";
		const month = MONTHS[parts.month - 1] ?? "";
		const dateText = `${pad(parts.month)}/${pad(parts.day)}/${pad(parts.year % 100)}`;
		const timeText = `${pad(parts.hour)}:${pad(parts.min)}:${pad(parts.sec)}`;
		return spec.replace(/%(.)/g, (whole: string, key: string): string => {
			switch (key) {
				case "a":
					return weekday.slice(0, 3);
				case "A":
					return weekday;
				case "b":
					return month.slice(0, 3);
				case "B":
					return month;
				case "c":
					return `${weekday.slice(0, 3)} ${month.slice(0, 3)} ${pad(
						parts.day,
					)} ${timeText} ${parts.year}`;
				case "d":
					return pad(parts.day);
				case "H":
					return pad(parts.hour);
				case "I":
					return pad(hour12);
				case "j": {
					const startOfYear = utc
						? Date.UTC(parts.year, 0, 1)
						: new Date(parts.year, 0, 1).getTime();
					return pad(
						Math.floor((date.getTime() - startOfYear) / 86_400_000) + 1,
						3,
					);
				}
				case "m":
					return pad(parts.month);
				case "M":
					return pad(parts.min);
				case "p":
					return parts.hour < 12 ? "AM" : "PM";
				case "S":
					return pad(parts.sec);
				case "x":
					return dateText;
				case "X":
					return timeText;
				case "y":
					return pad(parts.year % 100);
				case "Y":
					return String(parts.year);
				case "%":
					return "%";
				default:
					return whole;
			}
		});
	},
};

// --- bit32 -------------------------------------------------------------------

/** Luau's shifts saturate past the word: 32 or more clears the value. */
function shiftOut(disp: number): boolean {
	return disp >= 32 || disp <= -32;
}

/**
 * The Luau `bit32` library — 32-bit unsigned arithmetic, so every result comes
 * back through `>>> 0` rather than as JS's signed `| 0`.
 *
 * The one place JS and Luau genuinely differ is displacement: JS masks a shift
 * count to 5 bits (`x << 32` is `x`), Luau clears the value instead. These
 * follow Luau.
 */
export const bit32 = {
	band(...values: number[]): number {
		return values.reduce((a, b) => a & b, -1) >>> 0;
	},
	bor(...values: number[]): number {
		return values.reduce((a, b) => a | b, 0) >>> 0;
	},
	bxor(...values: number[]): number {
		return values.reduce((a, b) => a ^ b, 0) >>> 0;
	},
	bnot(value: number): number {
		return ~value >>> 0;
	},
	btest(...values: number[]): boolean {
		return bit32.band(...values) !== 0;
	},
	lshift(value: number, disp: number): number {
		const by = Math.trunc(disp);
		if (shiftOut(by)) return 0;
		return by >= 0 ? (value << by) >>> 0 : value >>> -by;
	},
	rshift(value: number, disp: number): number {
		const by = Math.trunc(disp);
		if (shiftOut(by)) return 0;
		return by >= 0 ? value >>> by : (value << -by) >>> 0;
	},
	/** Arithmetic: the sign bit fills, so a negative value saturates to all-ones. */
	arshift(value: number, disp: number): number {
		const by = Math.trunc(disp);
		if (by >= 32) return (value | 0) < 0 ? 0xffffffff : 0;
		if (by <= -32) return 0;
		return by >= 0 ? (value >> by) >>> 0 : (value << -by) >>> 0;
	},
	lrotate(value: number, disp: number): number {
		const by = ((Math.trunc(disp) % 32) + 32) % 32;
		return ((value << by) | (value >>> (32 - by))) >>> 0;
	},
	rrotate(value: number, disp: number): number {
		return bit32.lrotate(value, -disp);
	},
	/** `bit32.extract(n, field, width)` — `width` bits starting at bit `field`. */
	extract(n: number, field: number, width = 1): number {
		if (width >= 32) return n >>> 0;
		return (n >>> field) & ((1 << width) - 1);
	},
	/** `bit32.replace(n, v, field, width)` — `v` written into that bit range. */
	replace(n: number, v: number, field: number, width = 1): number {
		if (width >= 32) return v >>> 0;
		const mask = ((1 << width) - 1) << field;
		return (((n & ~mask) | ((v << field) & mask)) >>> 0) as number;
	},
	/** Leading zero bits; 32 for zero. */
	countlz(value: number): number {
		return Math.clz32(value);
	},
	/** Trailing zero bits; 32 for zero. */
	countrz(value: number): number {
		const word = value >>> 0;
		if (word === 0) return 32;
		return 31 - Math.clz32(word & -word);
	},
	/** `bit32.byteswap` — the word with its four bytes reversed. */
	byteswap(value: number): number {
		const word = value >>> 0;
		return (
			(((word & 0xff) << 24) |
				((word & 0xff00) << 8) |
				((word >>> 8) & 0xff00) |
				((word >>> 24) & 0xff)) >>>
			0
		);
	},
};

// --- utf8 --------------------------------------------------------------------

/**
 * The Luau `utf8` library.
 *
 * One deliberate difference, the same one {@link string} carries: the engine's
 * offsets are **byte** offsets into a UTF-8 string, and loom's are offsets into
 * a JS string, which is UTF-16. `char`, `len`, `codepoint` and the normalizers
 * therefore agree with the engine exactly — they deal in code points — while
 * the positions `codes`, `offset` and `graphemes` hand back are code-unit
 * positions, the ones {@link string.sub} on the same string expects. ASCII, and
 * so most UI source, cannot tell the two apart.
 */
export const utf8 = {
	/** The engine's `utf8.charpattern`, verbatim, for code that passes it on. */
	charpattern: "[\0-\x7F\xC2-\xFD][\x80-\xBF]*",
	/** `utf8.char` — the string for those code points. */
	char(...codepoints: number[]): string {
		return String.fromCodePoint(...codepoints);
	},
	/** `utf8.codepoint` — the code points of `s[i..j]`, as a tuple. */
	codepoint(s: string, i = 1, j: number = i): number[] {
		const start = Math.max(Math.trunc(i), 1);
		const end = Math.min(Math.trunc(j), s.length);
		const points: number[] = [];
		for (let k = start; k <= end; k++) {
			const point = s.codePointAt(k - 1);
			if (point === undefined) continue;
			// A low surrogate is the tail of the pair before it, never its own.
			const code = s.charCodeAt(k - 1);
			if (code >= 0xdc00 && code <= 0xdfff) continue;
			points.push(point);
		}
		return points;
	},
	/** `utf8.len` — how many code points `s[i..j]` holds. */
	len(s: string, i = 1, j = -1): number {
		return Array.from(string.sub(s, i, j)).length;
	},
	/** `utf8.codes` — `for (const [position, codepoint] of utf8.codes(s))`. */
	*codes(s: string): IterableIterator<[number, number]> {
		let index = 0;
		while (index < s.length) {
			const point = s.codePointAt(index);
			if (point === undefined) return;
			yield [index + 1, point];
			index += point > 0xffff ? 2 : 1;
		}
	},
	/**
	 * `utf8.offset(s, n, i?)` — the position of the nth code point from `i`
	 * (negative `n` counts back), or `nil` when it falls outside the string.
	 */
	offset(s: string, n: number, i?: number): number | undefined {
		const positions = [...utf8.codes(s)].map(([position]) => position);
		positions.push(s.length + 1); // the one-past-the-end position Lua allows
		const from = i ?? (n >= 0 ? 1 : s.length + 1);
		const anchor = positions.indexOf(from);
		if (anchor === -1) return undefined;
		const target = n > 0 ? anchor + n - 1 : anchor + n;
		return positions[target];
	},
	/** `utf8.graphemes` — the `[start, end]` span of each grapheme. */
	*graphemes(s: string): IterableIterator<[number, number]> {
		for (const [position, point] of utf8.codes(s)) {
			yield [position, position + (point > 0xffff ? 1 : 0)];
		}
	},
	nfcnormalize(s: string): string {
		return s.normalize("NFC");
	},
	nfdnormalize(s: string): string {
		return s.normalize("NFD");
	},
};

// --- debug -------------------------------------------------------------------

/** Open `debug.profilebegin` labels, so `profileend` closes the innermost. */
const profileLabels: string[] = [];

/**
 * The Roblox `debug` library. The profiling calls are wired to the browser's
 * own performance timeline — `profilebegin`/`profileend` become a `measure` the
 * devtools Performance panel shows — so the instrumentation a Roblox author
 * already wrote keeps paying off here. The memory-category calls have no
 * browser counterpart and are honest no-ops.
 */
export const debug = {
	/** `debug.traceback` — the JS stack, which is the real one here. */
	traceback(message?: string, _level?: number): string {
		const stack = new Error(message ?? "").stack ?? "";
		return message === undefined ? stack : `${message}\n${stack}`;
	},
	profilebegin(label: string): void {
		profileLabels.push(label);
		performance.mark(`loom:${label}:begin`);
	},
	profileend(): void {
		const label = profileLabels.pop();
		if (label === undefined) return;
		try {
			performance.measure(label, `loom:${label}:begin`);
		} catch {
			// A mark cleared out from under us is not worth failing a render over.
		}
	},
	setmemorycategory(_category: string): void {},
	resetmemorycategory(): void {},
	/**
	 * `debug.info` — the engine reads its answers out of the Luau VM, which does
	 * not exist here, so this returns the empty tuple. Callers destructure it
	 * (`const [source] = debug.info(1, "s")`) and read nils, rather than
	 * crashing on a missing function.
	 */
	info(..._args: unknown[]): unknown[] {
		return [];
	},
};

// --- buffer ------------------------------------------------------------------

/**
 * A Luau `buffer`: a fixed-size block of bytes. Luau's is a distinct primitive
 * type, so this is a class rather than a bare `ArrayBuffer` — {@link typeOf}
 * recognizes it and answers `"buffer"`.
 */
export class LuauBuffer {
	readonly bytes: Uint8Array;
	readonly view: DataView;

	constructor(size: number) {
		this.bytes = new Uint8Array(Math.max(Math.trunc(size), 0));
		this.view = new DataView(this.bytes.buffer);
	}
}

function bufferBounds(b: LuauBuffer, offset: number, size: number): number {
	const at = Math.trunc(offset);
	if (at < 0 || at + size > b.bytes.length) {
		throw new Error("buffer access out of bounds");
	}
	return at;
}

/**
 * The Luau `buffer` library — little-endian, like the engine's, and bounds
 * checked (an out-of-range access throws, as it does there).
 *
 * Strings are bytes: `fromstring`/`tostring` and `readstring`/`writestring` map
 * each code unit to one byte (latin-1), which is the same choice
 * {@link string.char} and {@link string.byte} make.
 */
export const buffer = {
	create(size: number): LuauBuffer {
		return new LuauBuffer(size);
	},
	fromstring(s: string): LuauBuffer {
		const b = new LuauBuffer(s.length);
		for (let i = 0; i < s.length; i++) b.bytes[i] = s.charCodeAt(i) & 0xff;
		return b;
	},
	tostring(b: LuauBuffer): string {
		let out = "";
		for (const byte of b.bytes) out += String.fromCharCode(byte);
		return out;
	},
	len(b: LuauBuffer): number {
		return b.bytes.length;
	},
	readi8(b: LuauBuffer, offset: number): number {
		return b.view.getInt8(bufferBounds(b, offset, 1));
	},
	readu8(b: LuauBuffer, offset: number): number {
		return b.view.getUint8(bufferBounds(b, offset, 1));
	},
	readi16(b: LuauBuffer, offset: number): number {
		return b.view.getInt16(bufferBounds(b, offset, 2), true);
	},
	readu16(b: LuauBuffer, offset: number): number {
		return b.view.getUint16(bufferBounds(b, offset, 2), true);
	},
	readi32(b: LuauBuffer, offset: number): number {
		return b.view.getInt32(bufferBounds(b, offset, 4), true);
	},
	readu32(b: LuauBuffer, offset: number): number {
		return b.view.getUint32(bufferBounds(b, offset, 4), true);
	},
	readf32(b: LuauBuffer, offset: number): number {
		return b.view.getFloat32(bufferBounds(b, offset, 4), true);
	},
	readf64(b: LuauBuffer, offset: number): number {
		return b.view.getFloat64(bufferBounds(b, offset, 8), true);
	},
	writei8(b: LuauBuffer, offset: number, value: number): void {
		b.view.setInt8(bufferBounds(b, offset, 1), value);
	},
	writeu8(b: LuauBuffer, offset: number, value: number): void {
		b.view.setUint8(bufferBounds(b, offset, 1), value);
	},
	writei16(b: LuauBuffer, offset: number, value: number): void {
		b.view.setInt16(bufferBounds(b, offset, 2), value, true);
	},
	writeu16(b: LuauBuffer, offset: number, value: number): void {
		b.view.setUint16(bufferBounds(b, offset, 2), value, true);
	},
	writei32(b: LuauBuffer, offset: number, value: number): void {
		b.view.setInt32(bufferBounds(b, offset, 4), value, true);
	},
	writeu32(b: LuauBuffer, offset: number, value: number): void {
		b.view.setUint32(bufferBounds(b, offset, 4), value, true);
	},
	writef32(b: LuauBuffer, offset: number, value: number): void {
		b.view.setFloat32(bufferBounds(b, offset, 4), value, true);
	},
	writef64(b: LuauBuffer, offset: number, value: number): void {
		b.view.setFloat64(bufferBounds(b, offset, 8), value, true);
	},
	/** `buffer.readstring(b, offset, count)` — `count` bytes as a string. */
	readstring(b: LuauBuffer, offset: number, count: number): string {
		const at = bufferBounds(b, offset, Math.max(Math.trunc(count), 0));
		let out = "";
		for (let i = 0; i < count; i++) {
			out += String.fromCharCode(b.bytes[at + i] as number);
		}
		return out;
	},
	/** `buffer.writestring(b, offset, s, count?)` — `count` defaults to all of `s`. */
	writestring(b: LuauBuffer, offset: number, s: string, count?: number): void {
		const length = Math.min(count ?? s.length, s.length);
		const at = bufferBounds(b, offset, length);
		for (let i = 0; i < length; i++) b.bytes[at + i] = s.charCodeAt(i) & 0xff;
	},
	/** `buffer.copy(target, targetOffset, source, sourceOffset?, count?)`. */
	copy(
		target: LuauBuffer,
		targetOffset: number,
		source: LuauBuffer,
		sourceOffset = 0,
		count?: number,
	): void {
		const from = Math.trunc(sourceOffset);
		const length = count ?? source.bytes.length - from;
		bufferBounds(source, from, length);
		const to = bufferBounds(target, targetOffset, length);
		target.bytes.set(source.bytes.subarray(from, from + length), to);
	},
	/** `buffer.fill(b, offset, value, count?)`. */
	fill(b: LuauBuffer, offset: number, value: number, count?: number): void {
		const at = Math.trunc(offset);
		const length = count ?? b.bytes.length - at;
		bufferBounds(b, at, length);
		b.bytes.fill(value & 0xff, at, at + length);
	},
};

/**
 * An inert `coroutine` library — enough for feature-detection code paths.
 * There are no real Luau threads in the browser; `running` is always `nil`.
 */
export const coroutine = {
	running(): undefined {
		return undefined;
	},
	status(_co?: unknown): string {
		return "suspended";
	},
	create<A extends unknown[], R>(fn: (...args: A) => R): { fn: typeof fn } {
		return { fn };
	},
	wrap<A extends unknown[], R>(fn: (...args: A) => R): typeof fn {
		return fn;
	},
};

// --- task --------------------------------------------------------------------

/** The cancelable handle `task.delay` returns (accepted by `task.cancel`). */
export interface TaskDelayHandle {
	cancelled: boolean;
	readonly timeout: ReturnType<typeof setTimeout>;
}

/**
 * The Roblox `task` scheduling library, mapped onto browser timers (the subset
 * UI code uses). `task.wait` returns a Promise so `await task.wait(n)` works; a
 * bare synchronous `task.wait()` cannot block in the browser. `task.delay`
 * returns a handle `task.cancel` can revoke.
 */
export const task = {
	spawn<A extends unknown[]>(fn: (...args: A) => void, ...args: A): void {
		queueMicrotask(() => fn(...args));
	},
	defer<A extends unknown[]>(fn: (...args: A) => void, ...args: A): void {
		queueMicrotask(() => fn(...args));
	},
	delay<A extends unknown[]>(
		seconds: number,
		fn: (...args: A) => void,
		...args: A
	): TaskDelayHandle {
		const handle: TaskDelayHandle = {
			cancelled: false,
			timeout: setTimeout(() => {
				if (!handle.cancelled) fn(...args);
			}, Math.max(0, seconds) * 1000),
		};
		return handle;
	},
	cancel(handle: TaskDelayHandle | undefined): void {
		if (!handle) return;
		clearTimeout(handle.timeout);
		handle.cancelled = true;
	},
	wait(seconds = 0): Promise<number> {
		return new Promise((resolve) =>
			setTimeout(() => resolve(seconds), Math.max(0, seconds) * 1000),
		);
	},
};

/** Roblox `tick()` — seconds (here, monotonic time since page load). */
export function tick(): number {
	return performance.now() / 1000;
}

/**
 * Luau `assert` — returns the value when truthy, otherwise throws.
 *
 * Returning the value (rather than being a TS `asserts` predicate) is the
 * deliberate choice: `const cfg = assert(maybeCfg, "no cfg")` is the idiom this
 * shim exists to reproduce, and an assertion function must return `void`, so
 * the two are mutually exclusive. Callers who want narrowing can `if (!x) …`.
 *
 * Truthiness is JS truthiness, not Luau's — `assert(0)` throws here and does
 * not in Luau. Loom runs the caller's own TS, whose `if` statements already use
 * JS rules, so matching them keeps one mental model rather than two.
 */
export function assert<T>(
	condition: T,
	message = "assertion failed!",
): NonNullable<T> {
	if (!condition) {
		throw new Error(message);
	}
	return condition as NonNullable<T>;
}

// --- prototype patches -------------------------------------------------------

function definePatch(
	proto: object,
	name: string | symbol,
	value: (...args: never[]) => unknown,
	/**
	 * Replace an existing member instead of bailing out. Only for names JS
	 * already defines with semantics no loom caller could want (see `sub`).
	 */
	force = false,
): void {
	if (!force && name in proto) return; // guarded: never clobber by accident
	Object.defineProperty(proto, name, {
		value,
		configurable: true,
		writable: true,
		enumerable: false,
	});
}

/**
 * The symbol keys the preview's macro transform rewrites `.size()` and
 * `.isEmpty()` to (see `@loom-dev/preview`'s `transform.ts`).
 *
 * `Map`/`Set` are why this indirection exists. roblox-ts declares `size()` as a
 * *method* on both; JS defines `size` as a *property*, and one name cannot be
 * both. Redefining `Map.prototype.size` would reach every `Map` in the page —
 * React's, Vite's, loom's own scheduler (`dirty.size === 0` drives the frame
 * loop) — so the roblox-ts spelling is instead resolved through a key nothing
 * but the transform emits, and only previewed source is ever transformed.
 *
 * `Symbol.for`, not `Symbol()`: the emitted code and this module reach the key
 * independently, and the registry is what makes them the same symbol.
 */
export const LUAU_SIZE = Symbol.for("loom.size");
export const LUAU_IS_EMPTY = Symbol.for("loom.isEmpty");

/**
 * Install the roblox-ts macro methods on `Array.prototype`/`String.prototype`
 * (`.size()`, `.isEmpty()`, `.remove(i)`, `.unorderedRemove(i)`, `.clear()`),
 * plus the Luau string methods roblox-ts calls off a string receiver
 * (`.lower()`, `.upper()`, `.sub()`, `.rep()`, `.find()`, `.gsub()`,
 * `.format()`) — each one delegating to the {@link string} library, so the
 * 1-based indices and tuple returns documented there apply here too.
 * Array indices are 0-based, matching roblox-ts TS-side array semantics (and
 * the lattice vitest shim). Guarded and non-enumerable; safe to call
 * repeatedly.
 */
export function applyPrototypePatches(): void {
	// The macro keys, on `Object.prototype` so one definition answers for every
	// receiver: `Map`/`Set` expose `size` as a number, the patched `Array`/
	// `String` expose it as a method, and a user class that wrote its own
	// `size()` keeps it. Symbol-keyed and non-enumerable, so `Object.keys`,
	// `for…in`, spread and `JSON.stringify` never see them.
	definePatch(
		Object.prototype,
		LUAU_SIZE,
		function (this: Record<string, unknown>) {
			const own = this.size;
			return typeof own === "function" ? own.call(this) : own;
		},
	);
	definePatch(
		Object.prototype,
		LUAU_IS_EMPTY,
		function (this: Record<string, unknown>) {
			const own = this.isEmpty;
			if (typeof own === "function") return own.call(this);
			const size = this.size;
			return (typeof size === "function" ? size.call(this) : size) === 0;
		},
	);
	definePatch(Array.prototype, "size", function (this: unknown[]) {
		return this.length;
	});
	definePatch(Array.prototype, "isEmpty", function (this: unknown[]) {
		return this.length === 0;
	});
	definePatch(
		Array.prototype,
		"remove",
		function (this: unknown[], index: number) {
			return this.splice(index, 1)[0];
		},
	);
	definePatch(
		Array.prototype,
		"unorderedRemove",
		function (this: unknown[], index: number) {
			if (index < 0 || index >= this.length) return undefined;
			const removed = this[index];
			const last = this.pop();
			if (index < this.length) this[index] = last;
			return removed;
		},
	);
	definePatch(Array.prototype, "clear", function (this: unknown[]) {
		this.length = 0;
	});
	definePatch(String.prototype, "size", function (this: string) {
		return this.length;
	});
	definePatch(String.prototype, "lower", function (this: string) {
		return string.lower(this);
	});
	definePatch(String.prototype, "upper", function (this: string) {
		return string.upper(this);
	});
	// `String.prototype.sub` already exists: it is the Annex B HTML wrapper that
	// returns `<sub>…</sub>`. Nothing in a loom scene wants that, and leaving the
	// guard in place would silently hand Luau callers markup, so this one name is
	// forced. There is deliberately no `split` patch — JS already defines it, and
	// `string.split` is implemented *with* it, so patching would recurse forever.
	// Native `split(sep)` matches Luau for a string separator anyway.
	definePatch(
		String.prototype,
		"sub",
		function (this: string, i?: number, j?: number) {
			return string.sub(this, i, j);
		},
		true,
	);
	definePatch(
		String.prototype,
		"rep",
		function (this: string, n: number, separator?: string) {
			return string.rep(this, n, separator);
		},
	);
	definePatch(
		String.prototype,
		"find",
		function (this: string, pattern: string, init?: number, plain?: boolean) {
			return string.find(this, pattern, init, plain);
		},
	);
	definePatch(
		String.prototype,
		"gsub",
		function (
			this: string,
			pattern: string,
			replacement: string,
			maxCount?: number,
		) {
			return string.gsub(this, pattern, replacement, maxCount);
		},
	);
	definePatch(
		String.prototype,
		"format",
		function (this: string, ...args: unknown[]) {
			return string.format(this, ...args);
		},
	);
	definePatch(String.prototype, "len", function (this: string) {
		return string.len(this);
	});
	definePatch(String.prototype, "reverse", function (this: string) {
		return string.reverse(this);
	});
	definePatch(
		String.prototype,
		"byte",
		function (this: string, i?: number, j?: number) {
			return string.byte(this, i, j);
		},
	);
	definePatch(
		String.prototype,
		"gmatch",
		function (this: string, pattern: string) {
			return string.gmatch(this, pattern);
		},
	);
	// `match` is deliberately NOT patched, unlike the rest of this list. JS
	// already defines `String.prototype.match`, with different semantics (a
	// RegExp, and `null` when it misses), and these patches land on the page's
	// one shared prototype — forcing it the way `sub` is forced would rewrite
	// `match` for React, Vite and every other library in the page, not just for
	// previewed source. `string.match(s, pattern)`, the form roblox-ts code
	// overwhelmingly writes for the Luau one, is unaffected.
}
