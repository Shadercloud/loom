/**
 * `enums.ts` — the Roblox `Enum` namespace (the subset loom needs).
 *
 * Layout enums (FillDirection, SortOrder, …) plus the input/interaction enums
 * the interactive runtime dispatches (UserInputType, KeyCode, UserInputState).
 * `Value` is the declaration index, not Roblox's exact numeric value — the
 * layout engine and event code key on `Name`, which is authoritative.
 */

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

	/** Roblox `tostring(enumItem)` shape: `Enum.<Type>.<Name>`. */
	toString(): string {
		return `Enum.${this.EnumType}.${this.Name}`;
	}
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

// `AutomaticCanvasSize` has no enum of its own in Roblox — the property reads
// `Enum.AutomaticSize` — so both keys alias one item set.
const automaticSize = makeEnum("AutomaticSize", [
	"None",
	"X",
	"Y",
	"XY",
] as const);

/** The Roblox `Enum` namespace (layout + input subset). */
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
	AutomaticSize: automaticSize,
	AutomaticCanvasSize: automaticSize,
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
	UserInputType: makeEnum("UserInputType", [
		"MouseButton1",
		"MouseButton2",
		"MouseButton3",
		"MouseMovement",
		"MouseWheel",
		"Touch",
		"Keyboard",
		"Gamepad1",
		"Focus",
		"None",
	] as const),
	KeyCode: makeEnum("KeyCode", [
		"Unknown",
		"Space",
		"Return",
		"Escape",
		"Tab",
		"Backspace",
		"Delete",
		"Up",
		"Down",
		"Left",
		"Right",
		"Home",
		"End",
		"PageUp",
		"PageDown",
		"A",
		"B",
		"C",
		"D",
		"E",
		"F",
		"G",
		"H",
		"I",
		"J",
		"K",
		"L",
		"M",
		"N",
		"O",
		"P",
		"Q",
		"R",
		"S",
		"T",
		"U",
		"V",
		"W",
		"X",
		"Y",
		"Z",
	] as const),
	UserInputState: makeEnum("UserInputState", [
		"Begin",
		"Change",
		"End",
		"Cancel",
		"None",
	] as const),
	ZIndexBehavior: makeEnum("ZIndexBehavior", ["Global", "Sibling"] as const),
	ScreenInsets: makeEnum("ScreenInsets", [
		"None",
		"DeviceSafeInsets",
		"CoreUISafeInsets",
	] as const),
	SelectionBehavior: makeEnum("SelectionBehavior", ["Escape", "Stop"] as const),
	EasingStyle: makeEnum("EasingStyle", [
		"Linear",
		"Quad",
		"Cubic",
		"Quart",
		"Sine",
		"Back",
		"Bounce",
		"Elastic",
		"Exponential",
	] as const),
	EasingDirection: makeEnum("EasingDirection", ["In", "Out", "InOut"] as const),
	TextTruncate: makeEnum("TextTruncate", ["None", "AtEnd"] as const),
	ElasticBehavior: makeEnum("ElasticBehavior", [
		"WhenScrollable",
		"Always",
		"Never",
	] as const),
	ScrollingDirection: makeEnum("ScrollingDirection", ["X", "Y", "XY"] as const),
	ScrollBarInset: makeEnum("ScrollBarInset", [
		"None",
		"ScrollBar",
		"Always",
	] as const),
};
