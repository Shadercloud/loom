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
