/**
 * `datatypes.ts` — Roblox datatypes for the browser preview.
 *
 * Minimal JS implementations of the Roblox GUI datatypes that component code
 * (`@rbxts/react`) constructs. The frontend adapters detect these via
 * `instanceof` and convert them into Scene IR property values. PascalCase
 * fields (`.X`, `.Scale`, `.R`) match Roblox's reflection so adapters read them
 * directly, and the lowercase arithmetic methods (`add`/`sub`/`mul`/`div`)
 * match roblox-ts's operator macro names.
 */
import { type PropertyValue, prop } from "@loom-dev/scene";
import { Enum, EnumItem } from "./enums";

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
	readonly X: UDim;
	readonly Y: UDim;
	/**
	 * Matches roblox-ts's two `UDim2.new` forms, both of which compile to
	 * `new UDim2(...)`: two `UDim`s (`new UDim2(xUDim, yUDim)`) or four numbers
	 * (`new UDim2(xScale, xOffset, yScale, yOffset)`). Component code uses the
	 * numeric form (e.g. `new UDim2(1, -22, 0, 2)`), so a `(UDim, UDim)`-only
	 * constructor would silently store the raw numbers and break layout.
	 */
	constructor(a: UDim | number = 0, b: UDim | number = 0, c = 0, d = 0) {
		if (a instanceof UDim && b instanceof UDim) {
			this.X = a;
			this.Y = b;
		} else {
			this.X = new UDim(a as number, b as number);
			this.Y = new UDim(c, d);
		}
	}
	static new(xScale = 0, xOffset = 0, yScale = 0, yOffset = 0): UDim2 {
		return new UDim2(new UDim(xScale, xOffset), new UDim(yScale, yOffset));
	}
	static fromScale(x = 0, y = 0): UDim2 {
		return new UDim2(new UDim(x, 0), new UDim(y, 0));
	}
	static fromOffset(x = 0, y = 0): UDim2 {
		return new UDim2(new UDim(0, x), new UDim(0, y));
	}
	/** roblox-ts `+` operator macro. */
	add(other: UDim2): UDim2 {
		return new UDim2(
			new UDim(this.X.Scale + other.X.Scale, this.X.Offset + other.X.Offset),
			new UDim(this.Y.Scale + other.Y.Scale, this.Y.Offset + other.Y.Offset),
		);
	}
	/** roblox-ts `-` operator macro. */
	sub(other: UDim2): UDim2 {
		return new UDim2(
			new UDim(this.X.Scale - other.X.Scale, this.X.Offset - other.X.Offset),
			new UDim(this.Y.Scale - other.Y.Scale, this.Y.Offset - other.Y.Offset),
		);
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
	static readonly zero = new Vector2(0, 0);
	static readonly one = new Vector2(1, 1);
	get Magnitude(): number {
		return Math.sqrt(this.X * this.X + this.Y * this.Y);
	}
	/** roblox-ts `+` operator macro. */
	add(other: Vector2): Vector2 {
		return new Vector2(this.X + other.X, this.Y + other.Y);
	}
	/** roblox-ts `-` operator macro. */
	sub(other: Vector2): Vector2 {
		return new Vector2(this.X - other.X, this.Y - other.Y);
	}
	/** roblox-ts `*` operator macro (vector or scalar). */
	mul(other: Vector2 | number): Vector2 {
		return typeof other === "number"
			? new Vector2(this.X * other, this.Y * other)
			: new Vector2(this.X * other.X, this.Y * other.Y);
	}
	/** roblox-ts `/` operator macro (vector or scalar). */
	div(other: Vector2 | number): Vector2 {
		return typeof other === "number"
			? new Vector2(this.X / other, this.Y / other)
			: new Vector2(this.X / other.X, this.Y / other.Y);
	}
}

export class Vector3 {
	constructor(
		readonly X: number,
		readonly Y: number,
		readonly Z: number,
	) {}
	static new(x = 0, y = 0, z = 0): Vector3 {
		return new Vector3(x, y, z);
	}
	static readonly zero = new Vector3(0, 0, 0);
	static readonly one = new Vector3(1, 1, 1);
	get Magnitude(): number {
		return Math.sqrt(this.X * this.X + this.Y * this.Y + this.Z * this.Z);
	}
	/** roblox-ts `+` operator macro. */
	add(other: Vector3): Vector3 {
		return new Vector3(this.X + other.X, this.Y + other.Y, this.Z + other.Z);
	}
	/** roblox-ts `-` operator macro. */
	sub(other: Vector3): Vector3 {
		return new Vector3(this.X - other.X, this.Y - other.Y, this.Z - other.Z);
	}
	/** roblox-ts `*` operator macro (vector or scalar). */
	mul(other: Vector3 | number): Vector3 {
		return typeof other === "number"
			? new Vector3(this.X * other, this.Y * other, this.Z * other)
			: new Vector3(this.X * other.X, this.Y * other.Y, this.Z * other.Z);
	}
}

/** A Roblox `Rect` (axis-aligned rectangle between two corners). */
export class Rect {
	readonly Width: number;
	readonly Height: number;
	constructor(
		readonly Min: Vector2,
		readonly Max: Vector2,
	) {
		this.Width = Max.X - Min.X;
		this.Height = Max.Y - Min.Y;
	}
	/** `Rect.new(minX, minY, maxX, maxY)` or `Rect.new(min, max)` vectors. */
	static new(
		a: Vector2 | number = 0,
		b: Vector2 | number = 0,
		maxX = 0,
		maxY = 0,
	): Rect {
		if (a instanceof Vector2) {
			return new Rect(a, b instanceof Vector2 ? b : Vector2.zero);
		}
		return new Rect(
			new Vector2(a, typeof b === "number" ? b : 0),
			new Vector2(maxX, maxY),
		);
	}
}

/**
 * A position-only Roblox `CFrame` — enough for the 2D motion code lattice
 * runs (`CFrame.Lerp` interpolation targets). No rotation support.
 */
export class CFrame {
	readonly Position: Vector3;
	constructor(x = 0, y = 0, z = 0) {
		this.Position = new Vector3(x, y, z);
	}
	static new(x = 0, y = 0, z = 0): CFrame {
		return new CFrame(x, y, z);
	}
	get X(): number {
		return this.Position.X;
	}
	get Y(): number {
		return this.Position.Y;
	}
	get Z(): number {
		return this.Position.Z;
	}
	Lerp(other: CFrame, alpha: number): CFrame {
		return new CFrame(
			this.X + (other.X - this.X) * alpha,
			this.Y + (other.Y - this.Y) * alpha,
			this.Z + (other.Z - this.Z) * alpha,
		);
	}
	FuzzyEq(other: CFrame, epsilon = 1e-5): boolean {
		return (
			Math.abs(this.X - other.X) <= epsilon &&
			Math.abs(this.Y - other.Y) <= epsilon &&
			Math.abs(this.Z - other.Z) <= epsilon
		);
	}
}

/**
 * A Roblox `Font` — the modern typeface value behind `TextLabel.FontFace`,
 * which supersedes the legacy `Font` *enum*. `Family` is a font-family asset
 * URI (`rbxasset://fonts/families/SourceSansPro.json`); the renderer maps its
 * basename onto a CSS family stack, and `Weight.Value` is already the CSS
 * weight number.
 */
export class Font {
	constructor(
		readonly Family = "rbxasset://fonts/families/SourceSansPro.json",
		readonly Weight: EnumItem<"FontWeight"> = Enum.FontWeight.Regular,
		readonly Style: EnumItem<"FontStyle"> = Enum.FontStyle.Normal,
	) {}

	/** Roblox's convenience flag: true from `SemiBold` up, as in the engine. */
	get Bold(): boolean {
		return this.Weight.Value >= Enum.FontWeight.SemiBold.Value;
	}

	static new(
		family?: string,
		weight?: EnumItem<"FontWeight">,
		style?: EnumItem<"FontStyle">,
	): Font {
		return new Font(family, weight, style);
	}

	/**
	 * `Font.fromEnum(Enum.Font.GothamBold)` — the bridge from the legacy enum,
	 * whose names fold a family and a weight into one identifier.
	 */
	static fromEnum(item: EnumItem<"Font">): Font {
		return new Font(
			`rbxasset://fonts/families/${LEGACY_FONT_FAMILIES[item.Name] ?? "SourceSansPro"}.json`,
			legacyFontWeight(item.Name),
			item.Name.includes("Italic")
				? Enum.FontStyle.Italic
				: Enum.FontStyle.Normal,
		);
	}

	/** `Font.fromName("SourceSansPro", …)` — family by bare name, not URI. */
	static fromName(
		name: string,
		weight?: EnumItem<"FontWeight">,
		style?: EnumItem<"FontStyle">,
	): Font {
		return new Font(`rbxasset://fonts/families/${name}.json`, weight, style);
	}
}

/** Legacy `Enum.Font` name → the family the modern datatype names it by. */
const LEGACY_FONT_FAMILIES: Record<string, string> = {
	SourceSans: "SourceSansPro",
	SourceSansBold: "SourceSansPro",
	SourceSansSemibold: "SourceSansPro",
	SourceSansLight: "SourceSansPro",
	SourceSansItalic: "SourceSansPro",
	Gotham: "GothamSSm",
	GothamMedium: "GothamSSm",
	GothamBold: "GothamSSm",
	GothamBlack: "GothamSSm",
	Arial: "Arial",
	ArialBold: "Arial",
	Highway: "HighwayGothic",
	Code: "Inconsolata",
	RobotoMono: "RobotoMono",
	Roboto: "Roboto",
	Legacy: "LegacyArial",
};

function legacyFontWeight(name: string): EnumItem<"FontWeight"> {
	if (name.includes("Black")) return Enum.FontWeight.Heavy;
	if (name.includes("Bold")) return Enum.FontWeight.Bold;
	if (name.includes("Semibold")) return Enum.FontWeight.SemiBold;
	if (name.includes("Medium")) return Enum.FontWeight.Medium;
	if (name.includes("Light")) return Enum.FontWeight.Light;
	return Enum.FontWeight.Regular;
}

/** An inert Roblox `TweenInfo` bag: the shape `TweenService` reads. */
export class TweenInfo {
	constructor(
		readonly Time = 1,
		readonly EasingStyle: EnumItem<"EasingStyle"> = Enum.EasingStyle.Quad,
		readonly EasingDirection: EnumItem<"EasingDirection"> = Enum.EasingDirection
			.Out,
		readonly RepeatCount = 0,
		readonly Reverses = false,
		readonly DelayTime = 0,
	) {}
	static new(
		time?: number,
		easingStyle?: EnumItem<"EasingStyle">,
		easingDirection?: EnumItem<"EasingDirection">,
		repeatCount?: number,
		reverses?: boolean,
		delayTime?: number,
	): TweenInfo {
		return new TweenInfo(
			time,
			easingStyle,
			easingDirection,
			repeatCount,
			reverses,
			delayTime,
		);
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
	Lerp(other: Color3, alpha: number): Color3 {
		return new Color3(
			this.R + (other.R - this.R) * alpha,
			this.G + (other.G - this.G) * alpha,
			this.B + (other.B - this.B) * alpha,
		);
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
	/**
	 * Takes every form `ColorSequence.new` does, because roblox-ts compiles all
	 * of them to `new ColorSequence(...)`: a keypoint list, one color (a flat
	 * ramp), or a two-color ramp. A `(keypoints)`-only constructor would store a
	 * `Color3` in `Keypoints` and blow up when the gradient is encoded.
	 */
	constructor(a: Color3 | readonly ColorSequenceKeypoint[] = [], b?: Color3) {
		this.Keypoints = Array.isArray(a)
			? (a as readonly ColorSequenceKeypoint[])
			: [
					new ColorSequenceKeypoint(0, a as Color3),
					new ColorSequenceKeypoint(1, b ?? (a as Color3)),
				];
	}
	/** `ColorSequence.new(c)`, `.new(c0, c1)`, or `.new(keypoints)`. */
	static new(
		a: Color3 | readonly ColorSequenceKeypoint[],
		b?: Color3,
	): ColorSequence {
		return new ColorSequence(a, b);
	}
}

/**
 * Encode a Roblox datatype instance (or primitive) as a Scene IR `PropertyValue` —
 * the canonical datatype→IR mapping shared by every frontend adapter (react, vide,
 * …). Unknown values (including Rect/Vector3/CFrame/TweenInfo, which the IR has
 * no slot for) return `undefined` so the property is dropped.
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
	if (v instanceof Font) {
		return prop.font({
			family: v.Family,
			weight: v.Weight.Value,
			style: v.Style.Name,
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
