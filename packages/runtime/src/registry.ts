/**
 * `registry.ts` — the class hierarchy behind `Instance.IsA`.
 *
 * A flat child → parent map covering the GUI classes loom renders plus the
 * service classnames the fake `game` tree exposes. `isA` walks the chain up to
 * `Instance` (always true). Unknown classes are treated as direct `Instance`
 * subclasses with a one-time warning, so a preview never crashes on a class
 * the registry hasn't met yet.
 */

const CLASS_PARENTS: Record<string, string> = {
	// GUI object tree.
	GuiBase2d: "Instance",
	GuiObject: "GuiBase2d",
	Frame: "GuiObject",
	ScrollingFrame: "GuiObject",
	CanvasGroup: "GuiObject",
	GuiButton: "GuiObject",
	TextButton: "GuiButton",
	ImageButton: "GuiButton",
	TextLabel: "GuiObject",
	TextBox: "GuiObject",
	ImageLabel: "GuiObject",
	VideoFrame: "GuiObject",
	ViewportFrame: "GuiObject",
	// Layer collectors and player containers.
	LayerCollector: "GuiBase2d",
	ScreenGui: "LayerCollector",
	SurfaceGui: "LayerCollector",
	BillboardGui: "LayerCollector",
	BasePlayerGui: "Instance",
	PlayerGui: "BasePlayerGui",
	// Non-GUI tree participants.
	Folder: "Instance",
	Camera: "Instance",
	Player: "Instance",
	ServiceProvider: "Instance",
	DataModel: "ServiceProvider",
	// UI modifier components.
	UIBase: "Instance",
	UIComponent: "UIBase",
	UICorner: "UIComponent",
	UIPadding: "UIComponent",
	UIStroke: "UIComponent",
	UIGradient: "UIComponent",
	UIScale: "UIComponent",
	UIFlexItem: "UIComponent",
	UILayout: "UIComponent",
	UIGridStyleLayout: "UILayout",
	UIListLayout: "UIGridStyleLayout",
	UIGridLayout: "UIGridStyleLayout",
	UIPageLayout: "UIGridStyleLayout",
	UITableLayout: "UIGridStyleLayout",
	UIConstraint: "UIComponent",
	UISizeConstraint: "UIConstraint",
	UITextSizeConstraint: "UIConstraint",
	UIAspectRatioConstraint: "UIConstraint",
	// Tweening.
	TweenBase: "Instance",
	Tween: "TweenBase",
	// Service classnames (`game.GetService` singletons).
	GuiService: "Instance",
	RunService: "Instance",
	TweenService: "Instance",
	UserInputService: "Instance",
	Players: "Instance",
	Workspace: "Instance",
	ContextActionService: "Instance",
	HttpService: "Instance",
	CollectionService: "Instance",
};

const warnedUnknown = new Set<string>();

/** The registered superclass of `className` (warns once for unknown classes). */
export function classParent(className: string): string | undefined {
	if (className === "Instance") return undefined;
	const parent = CLASS_PARENTS[className];
	if (parent !== undefined) return parent;
	if (!warnedUnknown.has(className)) {
		warnedUnknown.add(className);
		console.warn(
			`[loom] unknown class "${className}" — treating it as a direct Instance subclass`,
		);
	}
	return "Instance";
}

/** Yield `className` and each superclass up to (and including) `Instance`. */
export function* classChain(className: string): Generator<string, void> {
	let current: string | undefined = className;
	while (current !== undefined) {
		yield current;
		current = classParent(current);
	}
}

/** Roblox `Instance.IsA` semantics: `target` may be any ancestor class. */
export function isA(className: string, target: string): boolean {
	if (target === "Instance") return true;
	for (const cls of classChain(className)) {
		if (cls === target) return true;
	}
	return false;
}
