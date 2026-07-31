import { describe, expect, it } from "vitest";
import { Color3, TweenInfo, UDim2 } from "./datatypes";
import { Enum } from "./enums";
import { game } from "./game";
import { createInstance, type LoomInstance } from "./instance";
import { renderStepped } from "./scheduler";
import { getActiveTweenCount, tweenAlpha } from "./tween";

/** The scheduler's frame signal is what drives tweens; step it by hand. */
function frame(dt: number): void {
	renderStepped.fire(dt);
}

const service = () => game.GetService("TweenService");

const linear = (time: number) =>
	new TweenInfo(time, Enum.EasingStyle.Linear, Enum.EasingDirection.In);

function create(
	target: LoomInstance,
	info: TweenInfo,
	goals: Record<string, unknown>,
): LoomInstance {
	return (
		service().Create as (
			t: LoomInstance,
			i: TweenInfo,
			g: Record<string, unknown>,
		) => LoomInstance
	)(target, info, goals);
}

describe("tweenAlpha", () => {
	it("is the identity for Linear and clamps outside 0..1", () => {
		expect(tweenAlpha(0.25, "Linear", "In")).toBe(0.25);
		expect(tweenAlpha(-1, "Linear", "Out")).toBe(0);
		expect(tweenAlpha(2, "Linear", "Out")).toBe(1);
	});

	it("mirrors In into Out", () => {
		expect(tweenAlpha(0.5, "Quad", "In")).toBeCloseTo(0.25);
		expect(tweenAlpha(0.5, "Quad", "Out")).toBeCloseTo(0.75);
		expect(tweenAlpha(0.25, "Quad", "InOut")).toBeCloseTo(0.125);
	});

	it("falls back to Quad for a style it doesn't know", () => {
		expect(tweenAlpha(0.5, "NotAStyle", "In")).toBeCloseTo(0.25);
	});
});

describe("TweenService", () => {
	it("interpolates numbers over the tween's Time", () => {
		const frameInstance = createInstance("Frame", "Fade");
		frameInstance.BackgroundTransparency = 0;
		const tween = create(frameInstance, linear(1), {
			BackgroundTransparency: 1,
		});

		(tween.Play as () => void)();
		frame(0.5);
		expect(frameInstance.BackgroundTransparency).toBeCloseTo(0.5);
		frame(0.5);
		expect(frameInstance.BackgroundTransparency).toBe(1);
	});

	it("interpolates Color3 and UDim2 goals", () => {
		const frameInstance = createInstance("Frame", "Slide");
		frameInstance.BackgroundColor3 = Color3.fromRGB(0, 0, 0);
		frameInstance.Position = UDim2.fromOffset(0, 0);
		const tween = create(frameInstance, linear(1), {
			BackgroundColor3: Color3.fromRGB(255, 0, 0),
			Position: UDim2.fromOffset(100, 50),
		});

		(tween.Play as () => void)();
		frame(0.5);
		expect((frameInstance.BackgroundColor3 as Color3).R).toBeCloseTo(0.5);
		expect((frameInstance.Position as UDim2).X.Offset).toBeCloseTo(50);
		expect((frameInstance.Position as UDim2).Y.Offset).toBeCloseTo(25);
	});

	it("samples the starting values at Play, not at Create", () => {
		const frameInstance = createInstance("Frame", "Late");
		frameInstance.BackgroundTransparency = 0;
		const tween = create(frameInstance, linear(1), {
			BackgroundTransparency: 1,
		});

		// Moved after the tween was created — Roblox animates from here.
		frameInstance.BackgroundTransparency = 0.5;
		(tween.Play as () => void)();
		frame(0.5);
		expect(frameInstance.BackgroundTransparency).toBeCloseTo(0.75);
	});

	it("waits out DelayTime before moving anything", () => {
		const frameInstance = createInstance("Frame", "Delayed");
		frameInstance.BackgroundTransparency = 0;
		const tween = create(
			frameInstance,
			new TweenInfo(
				1,
				Enum.EasingStyle.Linear,
				Enum.EasingDirection.In,
				0,
				false,
				0.5,
			),
			{ BackgroundTransparency: 1 },
		);

		(tween.Play as () => void)();
		frame(0.4);
		expect(frameInstance.BackgroundTransparency).toBe(0);
		frame(0.6);
		expect(frameInstance.BackgroundTransparency).toBeCloseTo(0.5);
	});

	it("fires Completed with the playback state and stops stepping", () => {
		const frameInstance = createInstance("Frame", "Done");
		frameInstance.BackgroundTransparency = 0;
		const tween = create(frameInstance, linear(1), {
			BackgroundTransparency: 1,
		});

		let completedWith: unknown;
		(
			tween.Completed as {
				Connect(fn: (state: unknown) => void): unknown;
			}
		).Connect((state) => {
			completedWith = state;
		});

		(tween.Play as () => void)();
		expect(tween.PlaybackState).toBe(Enum.PlaybackState.Playing);
		frame(1);
		expect(completedWith).toBe(Enum.PlaybackState.Completed);
		expect(tween.PlaybackState).toBe(Enum.PlaybackState.Completed);
		expect(getActiveTweenCount()).toBe(0);
	});

	it("Cancel stops mid-flight and leaves the property where it was", () => {
		const frameInstance = createInstance("Frame", "Cancelled");
		frameInstance.BackgroundTransparency = 0;
		const tween = create(frameInstance, linear(1), {
			BackgroundTransparency: 1,
		});

		(tween.Play as () => void)();
		frame(0.5);
		(tween.Cancel as () => void)();
		frame(0.5);
		expect(frameInstance.BackgroundTransparency).toBeCloseTo(0.5);
		expect(tween.PlaybackState).toBe(Enum.PlaybackState.Cancelled);
		expect(getActiveTweenCount()).toBe(0);
	});

	it("Reverses returns to the starting value", () => {
		const frameInstance = createInstance("Frame", "There and back");
		frameInstance.BackgroundTransparency = 0;
		const tween = create(
			frameInstance,
			new TweenInfo(
				1,
				Enum.EasingStyle.Linear,
				Enum.EasingDirection.In,
				0,
				true,
			),
			{ BackgroundTransparency: 1 },
		);

		(tween.Play as () => void)();
		frame(1);
		expect(frameInstance.BackgroundTransparency).toBeCloseTo(1);
		frame(0.5);
		expect(frameInstance.BackgroundTransparency).toBeCloseTo(0.5);
		frame(0.5);
		expect(frameInstance.BackgroundTransparency).toBeCloseTo(0);
	});

	it("snaps goal types it cannot interpolate", () => {
		const label = createInstance("TextLabel", "Snap");
		label.Text = "before";
		const tween = create(label, linear(1), { Text: "after" });

		(tween.Play as () => void)();
		frame(0.5);
		expect(label.Text).toBe("after");
	});
});
