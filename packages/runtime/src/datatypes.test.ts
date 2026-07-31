import { describe, expect, it } from "vitest";
import {
	Color3,
	ColorSequence,
	ColorSequenceKeypoint,
	Font,
	toPropertyValue,
	UDim,
	UDim2,
} from "./datatypes";
import { Enum } from "./enums";
import { installGlobals } from "./index";

describe("UDim2 constructor", () => {
	it("accepts the four-number roblox-ts form (xScale, xOffset, yScale, yOffset)", () => {
		// roblox-ts compiles `new UDim2(1, -22, 0, 2)` to this; component code
		// (e.g. the switch thumb's checked position) relies on it.
		const value = new UDim2(1, -22, 0, 2);
		expect(value.X).toBeInstanceOf(UDim);
		expect(value.X.Scale).toBe(1);
		expect(value.X.Offset).toBe(-22);
		expect(value.Y.Scale).toBe(0);
		expect(value.Y.Offset).toBe(2);
	});

	it("accepts the two-UDim form", () => {
		const value = new UDim2(new UDim(0.5, 4), new UDim(0.25, 8));
		expect(value.X.Scale).toBe(0.5);
		expect(value.X.Offset).toBe(4);
		expect(value.Y.Scale).toBe(0.25);
		expect(value.Y.Offset).toBe(8);
	});

	it("defaults to a zero UDim2", () => {
		const value = new UDim2();
		expect(value.X.Scale).toBe(0);
		expect(value.Y.Offset).toBe(0);
	});

	it("static helpers stay consistent", () => {
		expect(UDim2.new(1, 2, 3, 4).X.Offset).toBe(2);
		expect(UDim2.fromOffset(10, 20).X.Offset).toBe(10);
		expect(UDim2.fromScale(0.5, 1).Y.Scale).toBe(1);
	});

	it("add/sub operate component-wise", () => {
		const sum = new UDim2(1, 2, 3, 4).add(new UDim2(1, 1, 1, 1));
		expect(sum.X.Scale).toBe(2);
		expect(sum.Y.Offset).toBe(5);
	});
});

describe("ColorSequence constructor", () => {
	const red = Color3.fromRGB(255, 0, 0);
	const blue = Color3.fromRGB(0, 0, 255);

	it("accepts the two-color roblox-ts form", () => {
		// roblox-ts compiles `ColorSequence.new(a, b)` to `new ColorSequence(a, b)`,
		// which used to store the Color3 itself in Keypoints and blow up on encode.
		const value = new ColorSequence(red, blue);
		expect(value.Keypoints).toHaveLength(2);
		expect(value.Keypoints[0]?.Time).toBe(0);
		expect(value.Keypoints[0]?.Value).toBe(red);
		expect(value.Keypoints[1]?.Time).toBe(1);
		expect(value.Keypoints[1]?.Value).toBe(blue);
	});

	it("accepts one color as a flat ramp", () => {
		const value = new ColorSequence(red);
		expect(value.Keypoints.map((k) => k.Value)).toEqual([red, red]);
	});

	it("still accepts a keypoint list", () => {
		const keypoints = [
			new ColorSequenceKeypoint(0, red),
			new ColorSequenceKeypoint(0.5, blue),
			new ColorSequenceKeypoint(1, red),
		];
		expect(new ColorSequence(keypoints).Keypoints).toEqual(keypoints);
	});

	it("encodes to the gradient IR either way", () => {
		expect(toPropertyValue(new ColorSequence(red, blue))).toEqual({
			type: "ColorSequence",
			value: {
				keypoints: [
					{ time: 0, color: { r: 1, g: 0, b: 0 } },
					{ time: 1, color: { r: 0, g: 0, b: 1 } },
				],
			},
		});
	});
});

describe("Color3.fromHex", () => {
	const channels = (color: Color3): [number, number, number] => [
		color.R,
		color.G,
		color.B,
	];

	it("converts the primaries exactly", () => {
		expect(channels(Color3.fromHex("#FF0000"))).toEqual([1, 0, 0]);
		expect(channels(Color3.fromHex("00FF00"))).toEqual([0, 1, 0]);
		expect(channels(Color3.fromHex("0000FF"))).toEqual([0, 0, 1]);
		expect(channels(Color3.fromHex("000000"))).toEqual([0, 0, 0]);
		expect(channels(Color3.fromHex("FFFFFF"))).toEqual([1, 1, 1]);
	});

	it("normalizes a mixed color the way fromRGB does", () => {
		const accent = Color3.fromHex("#6366F1");
		expect(accent.R).toBeCloseTo(99 / 255, 10);
		expect(accent.G).toBeCloseTo(102 / 255, 10);
		expect(accent.B).toBeCloseTo(241 / 255, 10);
		// The same channel conversion path, not a second one.
		expect(accent).toEqual(Color3.fromRGB(99, 102, 241));
	});

	it("accepts either case, with or without the leading #", () => {
		const expected = Color3.fromRGB(99, 102, 241);
		for (const hex of ["6366F1", "6366f1", "#6366F1", "#6366f1"]) {
			expect(Color3.fromHex(hex)).toEqual(expected);
		}
	});

	it("returns a new Color3 instance on every call", () => {
		const a = Color3.fromHex("#6366F1");
		const b = Color3.fromHex("#6366F1");
		expect(a).toBeInstanceOf(Color3);
		expect(a).not.toBe(b);
		expect(a).toEqual(b);
	});

	it("rejects everything that is not exactly six hex digits", () => {
		// CSS shorthand, alpha, `0x` notation, stray whitespace and non-hex digits
		// are all refused rather than silently reinterpreted.
		for (const hex of [
			"",
			"#",
			"FFF",
			"#FFF",
			"FFFFFFFF",
			"#FFFFFFFF",
			"GG0000",
			"0xFF0000",
			"##FF0000",
			" FF0000 ",
		]) {
			expect(() => Color3.fromHex(hex)).toThrow(
				`[loom] Color3.fromHex expected exactly 6 hexadecimal digits, received "${hex}"`,
			);
		}
	});

	it("leaves the rest of Color3 untouched", () => {
		expect(channels(Color3.new(0.25, 0.5, 0.75))).toEqual([0.25, 0.5, 0.75]);
		expect(channels(Color3.fromRGB(255, 128, 0))).toEqual([1, 128 / 255, 0]);
		const mid = Color3.fromHex("#000000").Lerp(Color3.fromHex("#FFFFFF"), 0.5);
		expect(channels(mid)).toEqual([0.5, 0.5, 0.5]);
		expect(toPropertyValue(Color3.fromHex("#FF0000"))).toEqual({
			type: "Color3",
			value: { r: 1, g: 0, b: 0 },
		});
	});

	it("reaches roblox-ts code through the installed global, unpatched", () => {
		// `installGlobals` installs the runtime's own constructor, so a static
		// added to the class is on the global by construction — no second patch,
		// and no risk of the two drifting.
		const target: Record<string, unknown> = {};
		installGlobals(target);
		expect(target.Color3).toBe(Color3);

		installGlobals();
		const Global = (globalThis as { Color3?: typeof Color3 }).Color3;
		expect(Global).toBe(Color3);
		expect(Global?.fromHex("#6366F1")).toBeInstanceOf(Color3);
		expect(Global?.fromHex("#6366F1")).toEqual(Color3.fromHex("#6366F1"));
		expect(Global?.fromHex("#FFFFFF")).toEqual(Color3.fromRGB(255, 255, 255));
	});

	it("has no ToHex counterpart yet (documented gap, not a silent one)", () => {
		// Roblox's `Color3:ToHex()` is not implemented: its casing and rounding
		// could not be verified against a running engine, and guessing them would
		// make round trips quietly wrong. Asserted so adding it is a deliberate
		// change to this test, with the round trip written at the same time.
		expect(
			(Color3.fromHex("#6366F1") as unknown as { ToHex?: unknown }).ToHex,
		).toBeUndefined();
	});
});

describe("Font", () => {
	it("defaults to regular Source Sans Pro", () => {
		const font = new Font();
		expect(font.Family).toBe("rbxasset://fonts/families/SourceSansPro.json");
		expect(font.Weight.Value).toBe(400);
		expect(font.Style.Name).toBe("Normal");
		expect(font.Bold).toBe(false);
	});

	it("reports Bold from SemiBold up, as the engine does", () => {
		expect(new Font(undefined, Enum.FontWeight.Medium).Bold).toBe(false);
		expect(new Font(undefined, Enum.FontWeight.SemiBold).Bold).toBe(true);
		expect(new Font(undefined, Enum.FontWeight.Heavy).Bold).toBe(true);
	});

	it("bridges the legacy Font enum", () => {
		const font = Font.fromEnum(Enum.Font.GothamBold);
		expect(font.Family).toBe("rbxasset://fonts/families/GothamSSm.json");
		expect(font.Weight).toBe(Enum.FontWeight.Bold);
		expect(Font.fromEnum(Enum.Font.SourceSansItalic).Style.Name).toBe("Italic");
	});

	it("encodes to the Font IR value", () => {
		const font = new Font(
			"rbxasset://fonts/families/GothamSSm.json",
			Enum.FontWeight.SemiBold,
			Enum.FontStyle.Italic,
		);
		expect(toPropertyValue(font)).toEqual({
			type: "Font",
			value: {
				family: "rbxasset://fonts/families/GothamSSm.json",
				weight: 600,
				style: "Italic",
			},
		});
	});
});
