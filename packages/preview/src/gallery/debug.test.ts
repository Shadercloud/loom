import {
	Color3,
	createInstance,
	Enum,
	getService,
	type LoomInstance,
	setHitTester,
	setRawProperty,
	UDim2,
	Vector2,
} from "@loom-dev/runtime";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	createDebugPanel,
	type DebugPanel,
	formatDebugCell,
	formatDebugValue,
} from "./debug.ts";
import { parseGalleryParams } from "./params.ts";

function playerGui(): LoomInstance {
	const players = getService("Players") as unknown as {
		LocalPlayer: LoomInstance;
	};
	const gui = players.LocalPlayer.FindFirstChildOfClass("PlayerGui");
	if (!gui) throw new Error("no PlayerGui");
	return gui;
}

function sectionEl(title: string): Element {
	const section = [...document.querySelectorAll(".loom-debug-section")].find(
		(el) => el.querySelector(".loom-debug-section-name")?.textContent === title,
	);
	if (!section) throw new Error(`no "${title}" section`);
	return section;
}

/** Every row of one section, as `{ key: value }`. */
function rows(title: string): Record<string, string> {
	const out: Record<string, string> = {};
	for (const row of sectionEl(title).querySelectorAll(".loom-debug-row")) {
		out[row.firstElementChild?.textContent ?? ""] =
			row.lastElementChild?.textContent ?? "";
	}
	return out;
}

/** The chips of one row, by its label. */
function chips(title: string, label: string): string[] {
	const row = [...sectionEl(title).querySelectorAll(".loom-debug-row")].find(
		(el) => el.firstElementChild?.textContent === label,
	);
	return [...(row?.querySelectorAll(".loom-debug-chip") ?? [])].map(
		(chip) => chip.textContent ?? "",
	);
}

/** The section's folded-state summary. */
function badge(title: string): string {
	return sectionEl(title).querySelector(".loom-debug-badge")?.textContent ?? "";
}

describe("?debug=", () => {
	it("is off unless the URL asks for it", () => {
		expect(parseGalleryParams("").debug).toBe(false);
		expect(parseGalleryParams("?target=a.loom.tsx").debug).toBe(false);
	});

	it("reads a bare flag, a truthy value, and an explicit off", () => {
		expect(parseGalleryParams("?debug").debug).toBe(true);
		expect(parseGalleryParams("?debug=1").debug).toBe(true);
		expect(parseGalleryParams("?debug=true").debug).toBe(true);
		expect(parseGalleryParams("?debug=0").debug).toBe(false);
		expect(parseGalleryParams("?debug=false").debug).toBe(false);
		expect(parseGalleryParams("?debug=off").debug).toBe(false);
	});
});

describe("debug value formatting", () => {
	it("prints Roblox datatypes the way Roblox does", () => {
		expect(formatDebugValue(new UDim2(1, 0, 0, 44))).toBe("{1, 0}, {0, 44}");
		expect(formatDebugValue(Vector2.new(2, 3))).toBe("2, 3");
	});

	it("shows a colour as hex with a swatch, not as three floats", () => {
		// `tostring(Color3)` is "1, 0, 0", which nobody reads as red.
		expect(formatDebugCell(Color3.fromRGB(255, 0, 0))).toMatchObject({
			text: "#ff0000",
			swatch: "#ff0000",
		});
	});

	it("colours a value by its type, so a long list stays scannable", () => {
		expect(formatDebugCell(12)?.kind).toBe("num");
		expect(formatDebugCell("hi")?.kind).toBe("str");
		expect(formatDebugCell(false)?.kind).toBe("bool");
		expect(formatDebugCell(Enum.FillDirection.Vertical)?.kind).toBe("enum");
	});

	it("keeps primitives readable and drops event bags", () => {
		expect(formatDebugValue("hello")).toBe('"hello"');
		expect(formatDebugValue(12)).toBe("12");
		expect(formatDebugValue(0.5)).toBe("0.50");
		expect(formatDebugValue(true)).toBe("true");
		expect(formatDebugValue(undefined)).toBe("nil");
		expect(formatDebugValue(() => {})).toBeUndefined();
	});

	it("names an instance instead of dumping it", () => {
		const frame = createInstance("Frame", "Card");
		expect(formatDebugValue(frame)).toBe("Card (Frame)");
	});
});

describe("the gallery debug panel", () => {
	let panel: DebugPanel;
	let stage: HTMLElement;

	beforeEach(() => {
		document.body.innerHTML = `
			<main id="loom-gallery-stage"><div id="loom-root"><div id="mount"></div></div></main>
		`;
		stage = document.getElementById("loom-gallery-stage") as HTMLElement;
		for (const child of playerGui().GetChildren()) child.Destroy();
		setHitTester(undefined);
		sessionStorage.clear(); // the panel remembers which sections are folded
		panel = createDebugPanel(stage);
	});

	afterEach(() => {
		panel.dispose();
		setHitTester(undefined);
	});

	it("stays out of the way until it is opened", () => {
		expect(document.getElementById("loom-debug")?.hidden).toBe(true);
		expect(panel.isOpen()).toBe(false);

		panel.setOpen(true);
		expect(document.getElementById("loom-debug")?.hidden).toBe(false);
		expect(panel.isOpen()).toBe(true);

		panel.toggle();
		expect(panel.isOpen()).toBe(false);
	});

	it("reports the mounted target and the last error", () => {
		panel.setOpen(true);
		panel.setTarget({
			key: "src/Scenes/Button.loom.tsx",
			title: "Button",
			importMs: 12.5,
		});

		expect(rows("target")).toMatchObject({
			path: "src/Scenes/Button.loom.tsx",
			title: "Button",
			import: "12.5 ms",
			status: "…",
		});

		panel.setError("render error in src/Scenes/Button.loom.tsx");
		expect(rows("target").status).toBe("error");
		expect(rows("target").error).toBe(
			"render error in src/Scenes/Button.loom.tsx",
		);

		panel.setError(undefined);
		expect(rows("target").error).toBeUndefined();
	});

	it("counts the live instance tree, per class and per layer", () => {
		const gui = createInstance("ScreenGui", "App");
		setRawProperty(gui, "DisplayOrder", 4);
		const frame = createInstance("Frame", "Card");
		frame.Parent = gui;
		createInstance("TextLabel", "Title").Parent = frame;
		createInstance("TextLabel", "Body").Parent = frame;
		gui.Parent = playerGui();

		panel.setOpen(true);
		expect(rows("scene")).toMatchObject({
			instances: "4",
			"gui objects": "3",
			depth: "3",
		});
		expect(chips("scene", "classes")).toEqual([
			"TextLabel 2",
			"Frame 1",
			"ScreenGui 1",
		]);
		// Each layer reports what it is and where it sits in the stack.
		expect(rows("scene").App).toContain("ScreenGui");
		expect(rows("scene").App).toContain("order 4");
		expect(badge("scene")).toBe("4 inst");
	});

	it("counts hidden objects, which are why a scene can look empty", () => {
		const gui = createInstance("ScreenGui", "App");
		const frame = createInstance("Frame", "Card");
		setRawProperty(frame, "Visible", false);
		frame.Parent = gui;
		gui.Parent = playerGui();

		panel.setOpen(true);
		expect(rows("scene")["gui objects"]).toBe("1 (1 hidden)");
	});

	it("reports the typeface the browser really gave the scene's text", () => {
		const label = createInstance("TextLabel", "Title");
		label.Parent = playerGui();

		panel.setOpen(true);
		const fonts = Object.values(rows("fonts"));
		expect(fonts).toHaveLength(1);
		// count · weights · whether the face is the one asked for.
		expect(fonts[0]).toMatch(/^1 · 400 · (loaded|fallback)$/);
	});

	it("inspects the topmost object under the pointer", () => {
		const gui = createInstance("ScreenGui", "App");
		const button = createInstance("TextButton", "Submit");
		setRawProperty(button, "Size", new UDim2(0, 120, 0, 44));
		setRawProperty(button, "Text", "Submit");
		setRawProperty(button, "ZIndex", 3);
		createInstance("UICorner", "Corner").Parent = button;
		button.Parent = gui;
		gui.Parent = playerGui();
		setHitTester((x, y) => (x > 10 && y > 10 ? [button] : []));

		panel.setOpen(true);
		stage.dispatchEvent(
			new MouseEvent("pointermove", { clientX: 40, clientY: 20 }),
		);

		expect(rows("inspect")).toMatchObject({
			class: "TextButton",
			Size: "{0, 120}, {0, 44}",
			Text: '"Submit"',
			ZIndex: "3",
		});
		// The ancestry is a clickable trail, not one long string.
		expect(chips("inspect", "path")).toEqual(["App", "Submit"]);
		expect(chips("inspect", "modifiers")).toEqual(["UICorner"]);
		// A text class also reports the face it ended up being measured in.
		expect(rows("inspect").face).toMatch(/loaded|fallback/);
		expect(
			document.querySelector(".loom-debug-highlight")?.hasAttribute("hidden"),
		).toBe(false);
	});

	it("selects an ancestor from the path trail", () => {
		const gui = createInstance("ScreenGui", "App");
		const frame = createInstance("Frame", "Card");
		frame.Parent = gui;
		gui.Parent = playerGui();
		setHitTester(() => [frame]);

		panel.setOpen(true);
		stage.dispatchEvent(
			new MouseEvent("pointermove", { clientX: 40, clientY: 20 }),
		);
		expect(rows("inspect").class).toBe("Frame");

		const trail = sectionEl("inspect").querySelectorAll(".loom-debug-chip");
		(trail[0] as HTMLElement).click();
		expect(rows("inspect").class).toBe("ScreenGui");
		// Selecting from the trail pins it, so the next hover doesn't undo it.
		stage.dispatchEvent(
			new MouseEvent("pointermove", { clientX: 60, clientY: 60 }),
		);
		expect(rows("inspect").class).toBe("ScreenGui");
	});

	it("pins a selection on alt+click, and releases it on Escape", () => {
		const button = createInstance("TextButton", "Submit");
		const frame = createInstance("Frame", "Card");
		button.Parent = playerGui();
		frame.Parent = playerGui();
		setHitTester(() => [button]);

		panel.setOpen(true);
		stage.dispatchEvent(
			new MouseEvent("pointerdown", { clientX: 40, clientY: 20, altKey: true }),
		);
		expect(badge("inspect")).toBe("pinned");

		setHitTester(() => [frame]);
		stage.dispatchEvent(
			new MouseEvent("pointermove", { clientX: 40, clientY: 20 }),
		);
		expect(rows("inspect").class).toBe("TextButton");

		window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
		expect(rows("inspect")).toEqual({
			"": "hover the stage · alt+click to pin",
		});
	});

	it("lists what else is under the pointer, and selects one on click", () => {
		const gui = createInstance("ScreenGui", "App");
		const frame = createInstance("Frame", "Card");
		const button = createInstance("TextButton", "Submit");
		frame.Parent = gui;
		button.Parent = frame;
		gui.Parent = playerGui();
		setHitTester(() => [button, frame, gui]);

		panel.setOpen(true);
		stage.dispatchEvent(
			new MouseEvent("pointermove", { clientX: 40, clientY: 20 }),
		);
		expect(rows("inspect").under).toBe("App (ScreenGui)");

		const under = [...sectionEl("inspect").querySelectorAll(".loom-debug-row")]
			.filter((row) => row.firstElementChild?.textContent === "under")
			.at(0) as HTMLElement;
		under.click();
		expect(rows("inspect").class).toBe("Frame");
	});

	it("counts what loom logged while it was open", () => {
		panel.setOpen(true);
		expect(rows("frame").console).toBe("quiet");

		console.warn("loom react: a world is claiming PlayerGui");
		panel.setError(undefined); // any refresh
		expect(rows("frame").console).toBe("1 warn · 0 error");
		expect(rows("frame")["last log"]).toContain("claiming PlayerGui");

		// Restored on close — nothing else in the page keeps a patched console.
		const patched = console.warn;
		panel.setOpen(false);
		expect(console.warn).not.toBe(patched);
	});

	it("folds a section away but keeps reporting its summary", () => {
		createInstance("ScreenGui", "App").Parent = playerGui();
		panel.setOpen(true);
		expect(Object.keys(rows("scene")).length).toBeGreaterThan(0);

		(sectionEl("scene").firstElementChild as HTMLElement).click();
		expect(rows("scene")).toEqual({});
		expect(badge("scene")).toBe("1 inst");
	});

	it("forgets an inspected object once it leaves the tree", () => {
		const frame = createInstance("Frame", "Card");
		frame.Parent = playerGui();
		setHitTester(() => [frame]);
		panel.setOpen(true);
		stage.dispatchEvent(
			new MouseEvent("pointermove", { clientX: 40, clientY: 20 }),
		);
		expect(rows("inspect").class).toBe("Frame");

		frame.Destroy();
		panel.setError(undefined); // any refresh
		expect(rows("inspect")).toEqual({
			"": "hover the stage · alt+click to pin",
		});
	});

	it("stops observing the stage when it closes, and cleans up on dispose", () => {
		const frame = createInstance("Frame", "Card");
		frame.Parent = playerGui();
		setHitTester(() => [frame]);
		panel.setOpen(true);
		panel.setOpen(false);

		stage.dispatchEvent(
			new MouseEvent("pointermove", { clientX: 40, clientY: 20 }),
		);
		panel.setOpen(true);
		expect(rows("inspect")).toEqual({
			"": "hover the stage · alt+click to pin",
		});

		panel.dispose();
		expect(document.getElementById("loom-debug")).toBeNull();
		expect(document.querySelector(".loom-debug-highlight")).toBeNull();
	});
});

/**
 * The JSON export: the same reading as the panel, as data. What a bug report
 * carries instead of a photograph of a panel.
 */
describe("the debug snapshot", () => {
	let panel: DebugPanel;

	beforeEach(() => {
		document.body.innerHTML = `
			<main id="loom-gallery-stage"><div id="loom-root"><div id="mount"></div></div></main>
		`;
		for (const child of playerGui().GetChildren()) child.Destroy();
		setHitTester(undefined);
		sessionStorage.clear();
		panel = createDebugPanel(
			document.getElementById("loom-gallery-stage") as HTMLElement,
		);
	});

	afterEach(() => {
		panel.dispose();
		setHitTester(undefined);
	});

	it("carries the target, the viewport and the whole scene tree", () => {
		const gui = createInstance("ScreenGui", "App");
		const frame = createInstance("Frame", "Card");
		setRawProperty(frame, "Size", new UDim2(0, 200, 0, 100));
		frame.Parent = gui;
		gui.Parent = playerGui();

		panel.setOpen(true);
		panel.setTarget({ key: "src/CardScene.loom.tsx", title: "Card" });

		const snap = panel.snapshot();
		expect(snap.target).toMatchObject({
			path: "src/CardScene.loom.tsx",
			title: "Card",
			status: "pending",
		});
		expect(snap.viewport.theme).toBe("dark");
		expect(snap.scene).toMatchObject({ instances: 2, guiObjects: 1, depth: 2 });
		expect(snap.scene?.classes).toEqual({ ScreenGui: 1, Frame: 1 });
		expect(snap.tree).toEqual([
			{
				name: "App",
				className: "ScreenGui",
				children: [
					{
						name: "Card",
						className: "Frame",
						visible: true,
						absolutePosition: { x: 0, y: 0 },
						absoluteSize: { width: 0, height: 0 },
					},
				],
			},
		]);
	});

	it("carries the selection with its properties, and stays serialisable", () => {
		const button = createInstance("TextButton", "Submit");
		setRawProperty(button, "Text", "Submit");
		setRawProperty(button, "BackgroundColor3", Color3.fromRGB(255, 0, 0));
		button.Parent = playerGui();
		setHitTester(() => [button]);

		panel.setOpen(true);
		document
			.getElementById("loom-gallery-stage")
			?.dispatchEvent(
				new MouseEvent("pointermove", { clientX: 40, clientY: 20 }),
			);

		const snap = panel.snapshot();
		expect(snap.selected).toMatchObject({
			name: "Submit",
			className: "TextButton",
			path: ["Submit"],
			properties: { Text: '"Submit"', BackgroundColor3: "#ff0000" },
		});
		expect(snap.selected?.typeface?.family).toBeTruthy();
		// No live instances anywhere in it — `JSON.stringify` has to be total.
		expect(() => JSON.stringify(snap)).not.toThrow();
	});

	it("publishes a console handle only while the panel is open", () => {
		const handle = () =>
			(window as unknown as { loomDebug?: { snapshot(): unknown } }).loomDebug;
		expect(handle()).toBeUndefined();

		panel.setOpen(true);
		expect(handle()?.snapshot()).toMatchObject({ url: expect.any(String) });

		panel.setOpen(false);
		expect(handle()).toBeUndefined();
	});
});
