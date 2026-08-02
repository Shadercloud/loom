import { describe, expect, it } from "vitest";
import { Enum } from "./enums";
import { createInstance, type LoomInstance } from "./instance";
import { type LoomPageLayout, pagesOf } from "./layouts";

/** A pager: a container with a UIPageLayout and `count` named pages. */
function pager(
	count: number,
	names?: string[],
): [LoomInstance, LoomPageLayout] {
	const container = createInstance("Frame", "Pager");
	const layout = createInstance("UIPageLayout") as LoomPageLayout;
	layout.Parent = container;
	for (let i = 0; i < count; i++) {
		const page = createInstance("Frame", names?.[i] ?? `P${i}`);
		page.LayoutOrder = i;
		page.Parent = container;
	}
	return [container, layout];
}

describe("UIPageLayout", () => {
	it("lists pages in the engine's flow order, skipping modifiers", () => {
		const [container, layout] = pager(3, ["Bee", "Ant", "Cat"]);
		createInstance("UIPadding").Parent = container;
		// SortOrder defaults to Name, as it does in the engine.
		expect(pagesOf(layout).map((p) => p.Name)).toEqual(["Ant", "Bee", "Cat"]);
		layout.SortOrder = Enum.SortOrder.LayoutOrder;
		expect(pagesOf(layout).map((p) => p.Name)).toEqual(["Bee", "Ant", "Cat"]);
	});

	it("starts on the first page and moves with JumpToIndex", () => {
		const [, layout] = pager(3);
		layout.SortOrder = Enum.SortOrder.LayoutOrder;
		expect(layout.CurrentPageIndex).toBe(0);
		expect((layout.CurrentPage as LoomInstance).Name).toBe("P0");

		layout.JumpToIndex(2);
		expect(layout.CurrentPageIndex).toBe(2);
		expect((layout.CurrentPage as LoomInstance).Name).toBe("P2");
	});

	it("clamps an out-of-range index instead of wrapping", () => {
		const [, layout] = pager(3);
		layout.JumpToIndex(9);
		expect(layout.CurrentPageIndex).toBe(2);
		layout.JumpToIndex(-4);
		expect(layout.CurrentPageIndex).toBe(0);
	});

	it("JumpTo takes the page itself, and warns for a stranger", () => {
		const [container, layout] = pager(3);
		layout.SortOrder = Enum.SortOrder.LayoutOrder;
		const second = container.GetChildren()[2] as LoomInstance;
		layout.JumpTo(second);
		expect(layout.CurrentPage).toBe(second);

		const stranger = createInstance("Frame", "Elsewhere");
		layout.JumpTo(stranger);
		expect(layout.CurrentPage).toBe(second); // unchanged
	});

	it("Next/Previous clamp, or wrap when Circular", () => {
		const [, layout] = pager(3);
		layout.SortOrder = Enum.SortOrder.LayoutOrder;
		layout.Previous();
		expect(layout.CurrentPageIndex).toBe(0);
		layout.Next();
		layout.Next();
		layout.Next();
		expect(layout.CurrentPageIndex).toBe(2);

		layout.Circular = true;
		layout.Next();
		expect(layout.CurrentPageIndex).toBe(0);
		layout.Previous();
		expect(layout.CurrentPageIndex).toBe(2);
	});

	it("fires PageLeave, PageEnter and Stopped on a jump", () => {
		const [, layout] = pager(3);
		layout.SortOrder = Enum.SortOrder.LayoutOrder;
		const seen: string[] = [];
		layout.PageLeave.Connect((p) => seen.push(`leave:${p.Name}`));
		layout.PageEnter.Connect((p) => seen.push(`enter:${p.Name}`));
		layout.Stopped.Connect((p) => seen.push(`stopped:${p.Name}`));
		layout.JumpToIndex(1);
		expect(seen).toEqual(["leave:P0", "enter:P1", "stopped:P1"]);

		// Re-showing the page already on screen changes nothing.
		seen.length = 0;
		layout.JumpToIndex(1);
		expect(seen).toEqual([]);
	});

	it("survives a layout with no pages", () => {
		const layout = createInstance("UIPageLayout") as LoomPageLayout;
		expect(pagesOf(layout)).toEqual([]);
		layout.JumpToIndex(2);
		layout.Next();
		expect(layout.CurrentPage).toBeUndefined();
		expect(layout.CurrentPageIndex).toBe(0);
	});
});
