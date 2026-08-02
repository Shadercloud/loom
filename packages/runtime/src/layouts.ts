/**
 * `layouts.ts` — the layout classes that carry runtime state.
 *
 * The layout engine is pure geometry over the Scene IR, so anything a layout
 * *remembers* between frames lives on the instance instead. Today that is
 * `UIPageLayout`: which page it shows is state, changed by method calls
 * (`JumpToIndex`, `Next`, …) rather than by a prop, and the engine has to see it.
 *
 * The engine reads it as **`CurrentPageIndex`**, a plain 0-based int. Roblox's
 * own `CurrentPage` is a *GuiObject reference*, and a Scene IR property value is
 * a datatype — never a node — so it cannot cross the wasm boundary. `CurrentPage`
 * is therefore derived from the index (see `registerPropertyReader`), which keeps
 * app code that reads the Roblox property working without a second source of
 * truth to drift.
 */
import { participatesInLayout } from "@loom-dev/scene";
import { EnumItem } from "./enums";
import {
	getEventSignal,
	getRawProperties,
	type LoomInstance,
	registerClassMethods,
	registerPropertyReader,
} from "./instance";
import type { LoomSignal } from "./signal";

/**
 * A `UIPageLayout`, typed past `LoomInstance`'s catch-all index signature — app
 * code calls these methods rather than reading a property, and every one of them
 * would otherwise come back `unknown`.
 */
export interface LoomPageLayout extends LoomInstance {
	/** Show the page at `index` (0-based), clamped to the page list. */
	JumpToIndex(index: number): void;
	/** Show `page`, which must be one of this layout's siblings. */
	JumpTo(page: LoomInstance): void;
	Next(): void;
	Previous(): void;
	readonly CurrentPage: LoomInstance | undefined;
	/** loom's stand-in for the engine's instance-valued `CurrentPage`. */
	readonly CurrentPageIndex: number;
	readonly PageEnter: LoomSignal<[LoomInstance]>;
	readonly PageLeave: LoomSignal<[LoomInstance]>;
	readonly Stopped: LoomSignal<[LoomInstance]>;
}

/** An enum-ish property's item name, from either spelling the engine accepts. */
function enumName(value: unknown): string | undefined {
	if (value instanceof EnumItem) return value.Name;
	return typeof value === "string" && value !== "" ? value : undefined;
}

/**
 * The pages a `UIPageLayout` flows, in the order the layout engine gives them:
 * its parent's layout-participating children, sorted by `SortOrder` (`Name` by
 * default, as in the engine). Mirrors `flow_order` in `crates/loom-layout` —
 * `JumpTo(page)` has to agree with where the engine put that page.
 */
export function pagesOf(layout: LoomInstance): LoomInstance[] {
	const parent = layout.Parent;
	if (!parent) return [];
	const pages = parent
		.GetChildren()
		.filter((child) => participatesInLayout(child.ClassName));
	if (enumName(layout.SortOrder) === "LayoutOrder") {
		return pages.sort(
			(a, b) => Number(a.LayoutOrder ?? 0) - Number(b.LayoutOrder ?? 0),
		);
	}
	// Byte-order on the name, like the Rust side — never `localeCompare`, whose
	// answer depends on the machine's locale. Equal names keep source order
	// (`Array.prototype.sort` is stable), which is what the engine does too.
	return pages.sort((a, b) => (a.Name < b.Name ? -1 : a.Name > b.Name ? 1 : 0));
}

/** The stored page index, defaulting to the first page. */
function currentIndex(layout: LoomInstance): number {
	const raw = getRawProperties(layout).get("CurrentPageIndex");
	return typeof raw === "number" && Number.isFinite(raw) ? Math.trunc(raw) : 0;
}

/**
 * Show the page at `index`, clamping to the page list — `JumpToIndex` clamps in
 * Roblox too. Fires `PageLeave`/`PageEnter`/`Stopped` in the engine's order.
 * There is no tween: `Animated` and `TweenTime` are animation, and the layout
 * engine only ever describes the settled state.
 */
function showPage(layout: LoomInstance, index: number): void {
	const pages = pagesOf(layout);
	if (pages.length === 0) return;
	const next = Math.min(Math.max(Math.trunc(index), 0), pages.length - 1);
	const previous = currentIndex(layout);
	// Re-showing the page already on screen is a no-op — unless nothing has been
	// shown yet, where jumping to page 0 is the app announcing its first page.
	if (next === previous && getRawProperties(layout).has("CurrentPageIndex")) {
		return;
	}
	const leaving = pages[previous];
	const entering = pages[next];
	// The normal property path: signals the change and marks the tree dirty, so
	// the next flush re-lays the strip out around the new page.
	layout.CurrentPageIndex = next;
	if (leaving && leaving !== entering) {
		getEventSignal(layout, "PageLeave").fire(leaving);
	}
	if (entering && entering !== leaving) {
		getEventSignal(layout, "PageEnter").fire(entering);
	}
	getEventSignal(layout, "Stopped").fire(entering);
}

/** Step by `delta` pages, wrapping when `Circular` and clamping otherwise. */
function step(layout: LoomInstance, delta: number): void {
	const count = pagesOf(layout).length;
	if (count === 0) return;
	const target = currentIndex(layout) + delta;
	showPage(
		layout,
		layout.Circular === true ? ((target % count) + count) % count : target,
	);
}

registerClassMethods("UIPageLayout", {
	JumpToIndex: (self: LoomInstance, index: number) => {
		showPage(self, index);
		return undefined;
	},
	JumpTo: (self: LoomInstance, page: LoomInstance) => {
		const index = pagesOf(self).indexOf(page);
		if (index < 0) {
			console.warn(
				`[loom] UIPageLayout:JumpTo(${String(page?.Name)}): not a page of this layout`,
			);
			return undefined;
		}
		showPage(self, index);
		return undefined;
	},
	Next: (self: LoomInstance) => {
		step(self, 1);
		return undefined;
	},
	Previous: (self: LoomInstance) => {
		step(self, -1);
		return undefined;
	},
});

// The two read-only Roblox properties, both derived from the stored index so
// they can never disagree with what the engine painted.
registerPropertyReader(
	"UIPageLayout",
	"CurrentPage",
	(self) => pagesOf(self)[currentIndex(self)],
);
registerPropertyReader("UIPageLayout", "CurrentPageIndex", currentIndex);
