// A vide UI: components are plain functions returning `create(...)` trees, and
// reactivity is fine-grained via `source` — a function-valued prop (the `Text`
// below) re-runs only when the source it reads changes. No JSX, no reconciler.
// The very same Scene IR / layout / renderer as the react example drives it.
import { create, type Source, source, type VideNode } from "@rbxts/vide";

// `create("Frame")({ ...props, [n]: child })`: string keys are Roblox properties
// (a function value is a reactive binding), number keys are children.

function Title(): VideNode {
	return create("TextLabel")({
		Name: "Title",
		AutomaticSize: Enum.AutomaticSize.XY,
		BackgroundTransparency: 1,
		LayoutOrder: 1,
		Text: "vide adapter demo",
		TextColor3: Color3.fromRGB(255, 255, 255),
		TextSize: 20,
		Font: Enum.Font.GothamBold,
	});
}

function Ticks(count: Source<number>): VideNode {
	return create("TextLabel")({
		Name: "Ticks",
		AutomaticSize: Enum.AutomaticSize.XY,
		BackgroundTransparency: 1,
		LayoutOrder: 2,
		Text: () => `ticks: ${count()}`,
		TextColor3: Color3.fromRGB(130, 170, 255),
		TextSize: 28,
		Font: Enum.Font.GothamBold,
	});
}

export function App(): VideNode {
	const count = source(0);
	// Drive the source; the `Ticks` binding re-resolves on each change.
	setInterval(() => count(count() + 1), 1000);

	return create("ScreenGui")({
		Name: "VideDemo",
		1: create("Frame")({
			Name: "Card",
			Size: UDim2.new(0, 320, 0, 120),
			Position: UDim2.fromScale(0.5, 0.5),
			AnchorPoint: Vector2.new(0.5, 0.5),
			BackgroundColor3: Color3.fromRGB(24, 27, 34),
			1: create("UICorner")({ CornerRadius: UDim.new(0, 12) }),
			2: create("UIStroke")({
				Color: Color3.fromRGB(70, 78, 95),
				Thickness: 1,
			}),
			3: create("UIListLayout")({
				FillDirection: Enum.FillDirection.Vertical,
				HorizontalAlignment: Enum.HorizontalAlignment.Center,
				VerticalAlignment: Enum.VerticalAlignment.Center,
				SortOrder: Enum.SortOrder.LayoutOrder,
				Padding: UDim.new(0, 8),
			}),
			4: Title(),
			5: Ticks(count),
		}),
	});
}
