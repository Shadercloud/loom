/**
 * `@loom-dev/runtime` — Roblox datatypes for the browser preview.
 *
 * Minimal JS implementations of the Roblox GUI datatypes that component code
 * (`@rbxts/react`) constructs. The react adapter detects these via `instanceof`
 * and converts them into Scene IR property values. PascalCase fields (`.X`,
 * `.Scale`, `.R`) match Roblox's reflection so adapters read them directly.
 *
 * M2 covers the Frame slice (UDim/UDim2/Vector2/Color3); more datatypes
 * (Enum, Rect, ColorSequence, …) are added as later milestones need them.
 */
import { type PropertyValue, prop } from "@loom-dev/scene";

export class UDim {
	constructor(
		readonly Scale: number,
		readonly Offset: number,
	) {}
	static new(scale = 0, offset = 0): UDim {
		return new UDim(scale, offset);
	}
}

export class UDim2 {
	constructor(
		readonly X: UDim,
		readonly Y: UDim,
	) {}
	static new(xScale = 0, xOffset = 0, yScale = 0, yOffset = 0): UDim2 {
		return new UDim2(new UDim(xScale, xOffset), new UDim(yScale, yOffset));
	}
	static fromScale(x = 0, y = 0): UDim2 {
		return new UDim2(new UDim(x, 0), new UDim(y, 0));
	}
	static fromOffset(x = 0, y = 0): UDim2 {
		return new UDim2(new UDim(0, x), new UDim(0, y));
	}
}

export class Vector2 {
	constructor(
		readonly X: number,
		readonly Y: number,
	) {}
	static new(x = 0, y = 0): Vector2 {
		return new Vector2(x, y);
	}
}

export class Color3 {
	/** Channels are 0..1, matching Roblox. */
	constructor(
		readonly R: number,
		readonly G: number,
		readonly B: number,
	) {}
	static new(r = 0, g = 0, b = 0): Color3 {
		return new Color3(r, g, b);
	}
	static fromRGB(r = 0, g = 0, b = 0): Color3 {
		// Roblox rounds and clamps each channel to 0..255 before normalizing.
		const c = (n: number): number =>
			Math.round(Math.min(255, Math.max(0, n))) / 255;
		return new Color3(c(r), c(g), c(b));
	}
}

export class ColorSequenceKeypoint {
	constructor(
		readonly Time: number,
		readonly Value: Color3,
	) {}
}

/** A Roblox `ColorSequence` (gradient color ramp). */
export class ColorSequence {
	readonly Keypoints: readonly ColorSequenceKeypoint[];
	constructor(keypoints: readonly ColorSequenceKeypoint[]) {
		this.Keypoints = keypoints;
	}
	/** `ColorSequence.new(c)`, `.new(c0, c1)`, or `.new(keypoints)`. */
	static new(
		a: Color3 | readonly ColorSequenceKeypoint[],
		b?: Color3,
	): ColorSequence {
		if (Array.isArray(a)) return new ColorSequence(a);
		const c0 = a as Color3;
		const c1 = b ?? c0;
		return new ColorSequence([
			new ColorSequenceKeypoint(0, c0),
			new ColorSequenceKeypoint(1, c1),
		]);
	}
}

/**
 * A Roblox `Enum` item, e.g. `Enum.FillDirection.Vertical`. Generic over its enum
 * type so adapter props can constrain to one enum (`EnumItem<"FillDirection">`).
 */
export class EnumItem<T extends string = string> {
	constructor(
		readonly EnumType: T,
		readonly Name: string,
		readonly Value: number,
	) {}
}

function makeEnum<E extends string, T extends readonly string[]>(
	enumType: E,
	names: T,
): { [K in T[number]]: EnumItem<E> } {
	const out = {} as Record<string, EnumItem<E>>;
	names.forEach((name, i) => {
		out[name] = new EnumItem(enumType, name, i);
	});
	return out as { [K in T[number]]: EnumItem<E> };
}

/**
 * The Roblox `Enum` namespace (the subset loom's layout reads). `Value` is the
 * declaration index, not Roblox's exact numeric value — the layout engine keys
 * on `Name`, which is authoritative.
 */
export const Enum = {
	FillDirection: makeEnum("FillDirection", ["Horizontal", "Vertical"] as const),
	HorizontalAlignment: makeEnum("HorizontalAlignment", [
		"Left",
		"Center",
		"Right",
	] as const),
	VerticalAlignment: makeEnum("VerticalAlignment", [
		"Top",
		"Center",
		"Bottom",
	] as const),
	SortOrder: makeEnum("SortOrder", ["Name", "LayoutOrder"] as const),
	AutomaticSize: makeEnum("AutomaticSize", ["None", "X", "Y", "XY"] as const),
	DominantAxis: makeEnum("DominantAxis", ["Width", "Height"] as const),
	AspectType: makeEnum("AspectType", [
		"FitWithinMaxSize",
		"ScaleWithParentSize",
	] as const),
	StartCorner: makeEnum("StartCorner", [
		"TopLeft",
		"TopRight",
		"BottomLeft",
		"BottomRight",
	] as const),
	TextXAlignment: makeEnum("TextXAlignment", [
		"Left",
		"Right",
		"Center",
	] as const),
	TextYAlignment: makeEnum("TextYAlignment", [
		"Top",
		"Center",
		"Bottom",
	] as const),
	ApplyStrokeMode: makeEnum("ApplyStrokeMode", [
		"Contextual",
		"Border",
	] as const),
	Font: makeEnum("Font", [
		"SourceSans",
		"SourceSansBold",
		"SourceSansSemibold",
		"SourceSansLight",
		"SourceSansItalic",
		"Gotham",
		"GothamMedium",
		"GothamBold",
		"GothamBlack",
		"Arial",
		"ArialBold",
		"Highway",
		"Code",
		"RobotoMono",
		"Roboto",
		"Legacy",
	] as const),
};

/**
 * Encode a Roblox datatype instance (or primitive) as a Scene IR `PropertyValue` —
 * the canonical datatype→IR mapping shared by every frontend adapter (react, vide,
 * …). Unknown values return `undefined` so the property is dropped.
 */
export function toPropertyValue(v: unknown): PropertyValue | undefined {
	if (v instanceof UDim2) {
		return prop.udim2({
			x: { scale: v.X.Scale, offset: v.X.Offset },
			y: { scale: v.Y.Scale, offset: v.Y.Offset },
		});
	}
	if (v instanceof UDim) return prop.udim({ scale: v.Scale, offset: v.Offset });
	if (v instanceof Vector2) return prop.vector2({ x: v.X, y: v.Y });
	if (v instanceof Color3) return prop.color3({ r: v.R, g: v.G, b: v.B });
	if (v instanceof ColorSequence) {
		return prop.colorSequence({
			keypoints: v.Keypoints.map((k) => ({
				time: k.Time,
				color: { r: k.Value.R, g: k.Value.G, b: k.Value.B },
			})),
		});
	}
	if (v instanceof EnumItem) {
		return prop.enum({ enumType: v.EnumType, name: v.Name, value: v.Value });
	}
	if (typeof v === "number") return prop.number(v);
	if (typeof v === "boolean") return prop.bool(v);
	if (typeof v === "string") return prop.string(v);
	return undefined;
}

/**
 * The Roblox `task` scheduling library, mapped onto browser timers (the subset UI
 * code uses). `task.wait` returns a Promise so `await task.wait(n)` works; a bare
 * synchronous `task.wait()` cannot block in the browser.
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
	): void {
		setTimeout(() => fn(...args), Math.max(0, seconds) * 1000);
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
 * Install the datatypes as runtime globals, the way roblox-ts code expects
 * (`UDim2.new` etc. without an import). The loom Vite plugin invokes this before
 * the app entry; typed preview code can also import the classes directly.
 */
export function installGlobals(
	target: Record<string, unknown> = globalThis as unknown as Record<
		string,
		unknown
	>,
): void {
	target.UDim = UDim;
	target.UDim2 = UDim2;
	target.Vector2 = Vector2;
	target.Color3 = Color3;
	target.ColorSequence = ColorSequence;
	target.ColorSequenceKeypoint = ColorSequenceKeypoint;
	target.Enum = Enum;
	target.task = task;
	target.tick = tick;
}
