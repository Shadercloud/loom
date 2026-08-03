/**
 * Wrapped-text settling, against the **real** layout engine.
 *
 * `world.test.ts` stubs the layout, which is right for the questions it asks
 * and useless for this one: whether an auto-sizing `TextWrapped` label ends up
 * with a box that matches the text the browser will then paint into it. That is
 * a feedback loop — measure → lay out → learn the width → measure again — and
 * only the real engine closes it.
 *
 * The oracle is exact rather than visual. happy-dom paints no text, so the
 * canvas is stubbed with a fixed advance per character, and the test re-runs the
 * adapter's own greedy wrap at the width the layout actually gave the label. If
 * that line count disagrees with the one the label's height encodes, the label
 * is a box built for one wrap painted with another — the failure reported in
 * #11, where a body sized for two lines was painted with four and showed a
 * one-line slice of the middle.
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { LoomInstance } from "@loom-dev/runtime";
import {
	Enum,
	flushDirtyNow,
	getDirtyCount,
	markDirty,
	UDim,
	UDim2,
	Vector2,
} from "@loom-dev/runtime";
import type { LayoutResult, SceneNode, Viewport } from "@loom-dev/scene";
import { createElement, type ReactElement } from "react";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import initWasm, {
	computeLayout as rawComputeLayout,
} from "../../layout/pkg/loom_layout_wasm.js";
import { type MountedWorld, mountSync } from "./index";

/** Advance width of one character in the stubbed face. */
const CHAR_W = 7;
const BODY = "View player information, statistics, and recent activity.";
const BODY_SIZE = 18;
const BODY_LINE_HEIGHT = 1.4;

/**
 * happy-dom has no 2D context and the adapter caches the first one it is given,
 * so this is installed at import time. A fixed advance per character makes the
 * wrap deterministic and lets the test recompute it exactly.
 */
Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
	configurable: true,
	writable: true,
	value: () => ({
		font: "",
		measureText: (text: string) => ({ width: text.length * CHAR_W }),
	}),
});

/**
 * The adapter's greedy wrap (`measureSegments`), re-run here over the stub's
 * metrics: pieces are words and the whitespace between them, a piece that no
 * longer fits opens a line, and a run of spaces that would overflow is dropped
 * rather than carried over.
 */
function wrapLines(text: string, wrapAt: number): number {
	let lines = 0;
	let lineWidth = 0;
	for (const piece of text.split(/(\s+)/)) {
		if (piece === "") continue;
		const pieceWidth = piece.length * CHAR_W;
		if (lineWidth > 0 && lineWidth + pieceWidth > wrapAt) {
			lines += 1;
			lineWidth = 0;
			if (piece.trim() === "") continue;
		}
		lineWidth += pieceWidth;
	}
	return lines + 1;
}

/** The line count a label's laid-out height encodes, given its text metrics. */
function linesFromHeight(height: number, size: number, lineHeight: number) {
	return 1 + (height - size) / (size * lineHeight);
}

const pad = (px: number) =>
	createElement("uipadding", {
		PaddingLeft: UDim.new(0, px),
		PaddingRight: UDim.new(0, px),
		PaddingTop: UDim.new(0, px),
		PaddingBottom: UDim.new(0, px),
	});

/** An auto-sizing text label, the shape the reported library's `Text` builds. */
const label = (name: string, text: string, size: number, lineHeight: number) =>
	createElement("textlabel", {
		Name: name,
		Size: UDim2.fromScale(0, 0),
		AutomaticSize: Enum.AutomaticSize.XY,
		Text: text,
		TextSize: size,
		LineHeight: lineHeight,
		TextWrapped: true,
		RichText: true,
	});

const button = (name: string, text: string) =>
	createElement(
		"frame",
		{
			key: name,
			Name: name,
			Size: UDim2.fromScale(0, 0),
			AutomaticSize: Enum.AutomaticSize.XY,
		},
		pad(10),
		label(`${name}Text`, text, 18, 1.4),
	);

/**
 * The reported scene, structurally: a wrapping row of `45%` columns, each
 * holding an auto-sizing card whose vertical list fills the cross axis, whose
 * body is a padded auto container inside a flex item, and whose footer has an
 * irreducible two-button minimum.
 */
function cards(count: number): ReactElement {
	const one = (i: number) =>
		createElement(
			"frame",
			{
				key: `col${i}`,
				Name: `Col${i}`,
				Size: UDim2.new(0.45, 0, 0, 0),
				AutomaticSize: Enum.AutomaticSize.Y,
				BackgroundTransparency: 1,
			},
			createElement(
				"frame",
				{
					Name: `Card${i}`,
					Size: UDim2.fromScale(1, 1),
					AutomaticSize: Enum.AutomaticSize.XY,
				},
				createElement("uilistlayout", {
					FillDirection: Enum.FillDirection.Vertical,
					HorizontalFlex: Enum.UIFlexAlignment.Fill,
					SortOrder: Enum.SortOrder.LayoutOrder,
				}),
				createElement(
					"frame",
					{
						Name: `Header${i}`,
						LayoutOrder: 0,
						Size: UDim2.fromScale(0, 0),
						AutomaticSize: Enum.AutomaticSize.XY,
					},
					pad(12),
					label(`HeaderText${i}`, "Player Profile", 24, 1.25),
				),
				createElement(
					"frame",
					{
						Name: `Flex${i}`,
						LayoutOrder: 1,
						Size: UDim2.fromScale(0, 0),
						AutomaticSize: Enum.AutomaticSize.XY,
					},
					createElement("uiflexitem", { FlexMode: Enum.UIFlexMode.Grow }),
					createElement("uilistlayout", {
						FillDirection: Enum.FillDirection.Horizontal,
					}),
					createElement(
						"frame",
						{
							Name: `BodyBox${i}`,
							Size: UDim2.fromScale(0, 0),
							AutomaticSize: Enum.AutomaticSize.XY,
						},
						pad(12),
						label(`BodyText${i}`, BODY, BODY_SIZE, BODY_LINE_HEIGHT),
					),
				),
				createElement(
					"frame",
					{
						Name: `Footer${i}`,
						LayoutOrder: 2,
						Size: UDim2.fromScale(0, 0),
						AutomaticSize: Enum.AutomaticSize.XY,
					},
					pad(12),
					createElement("uilistlayout", {
						FillDirection: Enum.FillDirection.Horizontal,
						Wraps: true,
					}),
					button(`Cancel${i}`, "Cancel"),
					button(`Save${i}`, "Save"),
				),
			),
		);
	return createElement(
		"screengui",
		{ Name: "Gui" },
		createElement(
			"frame",
			{
				Name: "Row",
				Size: UDim2.new(0.9, 0, 1, 0),
				BackgroundTransparency: 1,
			},
			createElement("uilistlayout", {
				FillDirection: Enum.FillDirection.Horizontal,
				Wraps: true,
			}),
			...Array.from({ length: count }, (_, i) => one(i)),
		),
	);
}

describe("wrapped text against the real layout engine", () => {
	let mount: HTMLElement;
	let root: MountedWorld | undefined;

	beforeAll(async () => {
		// wasm-pack's `web` glue fetches by URL, which Node will not do for a
		// file:; hand it the bytes instead.
		await initWasm({
			module_or_path: await readFile(
				resolve(process.cwd(), "packages/layout/pkg/loom_layout_wasm_bg.wasm"),
			),
		});
	});

	beforeEach(() => {
		document.body.innerHTML = "";
		root?.unmount();
		root = undefined;
		mount = document.createElement("div");
		document.body.appendChild(mount);
	});

	const realLayout = (scene: SceneNode, viewport: Viewport): LayoutResult =>
		rawComputeLayout(scene, viewport) as LayoutResult;

	function setStage(width: number, height = 800): void {
		Object.defineProperty(mount, "clientWidth", {
			value: width,
			configurable: true,
		});
		Object.defineProperty(mount, "clientHeight", {
			value: height,
			configurable: true,
		});
	}

	/**
	 * Run frames until nothing is dirty. The adapter's give-up path defers the
	 * rest of a settle to the next `requestAnimationFrame`; driving the queue by
	 * hand makes "how many frames did that take" an observable, and a scene that
	 * never settles show up as the cap rather than as a hang.
	 */
	function settle(maxFrames = 20): number {
		let frames = 0;
		while (getDirtyCount() > 0 && frames < maxFrames) {
			flushDirtyNow();
			frames += 1;
		}
		return frames;
	}

	/** Push a fresh flush through the world, the way a resize does. */
	function reflow(world: MountedWorld): number {
		markDirty(world.world.rootInstance as LoomInstance);
		return settle();
	}

	function measure(name: string) {
		const el = mount.querySelector(
			`[data-loom-name="${name}"]`,
		) as HTMLElement | null;
		if (!el) throw new Error(`no element painted for ${name}`);
		return {
			width: Number.parseFloat(el.style.width),
			height: Number.parseFloat(el.style.height),
		};
	}

	/**
	 * A settled sweep: mount `tree`, then walk the stage down a width at a time,
	 * settling each one, and report every width where the label's box disagrees
	 * with the wrap its own laid-out width produces.
	 */
	function sweep(
		tree: ReactElement,
		labelName: string,
		text: string,
		widths: readonly number[],
	): Array<Record<string, number>> {
		setStage(widths[0] as number);
		root = mountSync(tree, mount, { computeLayout: realLayout });
		settle();
		const mismatches: Array<Record<string, number>> = [];
		for (const width of widths) {
			setStage(width);
			const frames = reflow(root);
			const box = measure(labelName);
			const painted = wrapLines(text, box.width);
			const encoded = linesFromHeight(box.height, BODY_SIZE, BODY_LINE_HEIGHT);
			if (Math.abs(encoded - painted) > 0.01 || getDirtyCount() > 0) {
				mismatches.push({
					stage: width,
					labelWidth: box.width,
					labelHeight: box.height,
					painted,
					encoded: Math.round(encoded * 100) / 100,
					frames,
					stillDirty: getDirtyCount(),
				});
			}
		}
		return mismatches;
	}

	const range = (from: number, to: number, step = 10): number[] => {
		const out: number[] = [];
		for (let w = from; w >= to; w -= step) out.push(w);
		return out;
	};

	it("settles the reported card scene at every width", () => {
		// Every pixel from a desktop window down to a phone: the reported failure
		// is width-dependent, so a coarse sweep could step straight over it.
		expect(sweep(cards(5), "BodyText0", BODY, range(1200, 200, 5))).toEqual([]);
	});

	/**
	 * The shapes where the wrap width and the painted width could come apart.
	 * `wrapWidth` measures against the nearest ancestor that has a width of its
	 * own, less the padding in between — it reads no siblings, no constraints and
	 * no scale insets, so anything else that takes room off the label leaves it
	 * painted narrower than it was measured, which is more lines than its box was
	 * built for.
	 */
	function inBox(
		child: ReactElement,
		extras: ReactElement[] = [],
		boxWidth = 300,
	): ReactElement {
		return createElement(
			"screengui",
			{ Name: "Gui" },
			createElement(
				"frame",
				{ Name: "Fixed", Size: UDim2.new(0, boxWidth, 0, 400) },
				...extras,
				child,
			),
		);
	}

	const wrapped = (name: string) =>
		createElement(
			"frame",
			{
				Name: `${name}Box`,
				Size: UDim2.fromScale(0, 0),
				AutomaticSize: Enum.AutomaticSize.XY,
			},
			label(name, BODY, BODY_SIZE, BODY_LINE_HEIGHT),
		);

	it("settles a label sharing a horizontal row with a sibling", () => {
		const tree = inBox(wrapped("Body"), [
			createElement("uilistlayout", {
				FillDirection: Enum.FillDirection.Horizontal,
			}),
			createElement("frame", {
				Name: "Spacer",
				LayoutOrder: -1,
				Size: UDim2.new(0, 120, 0, 20),
			}),
		]);
		expect(sweep(tree, "Body", BODY, range(600, 200))).toEqual([]);
	});

	it("settles a label under a scale UIPadding", () => {
		// `horizontalPadding` reads offsets only; a scale inset takes room the
		// wrap width never hears about.
		const tree = inBox(
			createElement(
				"frame",
				{
					Name: "Padded",
					Size: UDim2.fromScale(1, 0),
					AutomaticSize: Enum.AutomaticSize.Y,
				},
				createElement("uipadding", {
					PaddingLeft: new UDim(0.15, 0),
					PaddingRight: new UDim(0.15, 0),
				}),
				label("Body", BODY, BODY_SIZE, BODY_LINE_HEIGHT),
			),
		);
		expect(sweep(tree, "Body", BODY, range(600, 200))).toEqual([]);
	});

	it("settles a label capped by a UISizeConstraint", () => {
		const tree = inBox(
			createElement(
				"frame",
				{
					Name: "Holder",
					Size: UDim2.fromScale(0, 0),
					AutomaticSize: Enum.AutomaticSize.XY,
				},
				createElement("uisizeconstraint", {
					MaxSize: new Vector2(140, 10_000),
				}),
				label("Body", BODY, BODY_SIZE, BODY_LINE_HEIGHT),
			),
		);
		expect(sweep(tree, "Body", BODY, range(600, 200))).toEqual([]);
	});

	it("settles a label inside a shrinking flex item", () => {
		// `UIFlexMode.Shrink` is the one modifier that takes an item *below* its
		// natural width, which is the other way a label can be painted narrower
		// than it was measured.
		const tree = inBox(
			createElement(
				"frame",
				{
					Name: "Shrinker",
					Size: UDim2.fromScale(0, 0),
					AutomaticSize: Enum.AutomaticSize.XY,
				},
				createElement("uiflexitem", { FlexMode: Enum.UIFlexMode.Shrink }),
				label("Body", BODY, BODY_SIZE, BODY_LINE_HEIGHT),
			),
			[
				createElement("uilistlayout", {
					FillDirection: Enum.FillDirection.Horizontal,
				}),
				createElement("frame", {
					key: "sibling",
					Name: "Sibling",
					LayoutOrder: 1,
					Size: UDim2.new(0, 100, 0, 20),
				}),
			],
		);
		expect(sweep(tree, "Body", BODY, range(600, 200))).toEqual([]);
	});
});
