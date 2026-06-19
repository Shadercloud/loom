// A self-contained roblox-ts-style component: @rbxts/react hooks, global Roblox
// datatypes, no @loom-dev imports. Run it with `loom preview`.
import { useEffect, useState } from "@rbxts/react";

export function App() {
	const [count, setCount] = useState(0);
	useEffect(() => {
		const handle = setInterval(() => setCount((c) => c + 1), 1000);
		return () => clearInterval(handle);
	}, []);

	return (
		<screengui Name="App">
			<frame
				Name="Card"
				Size={UDim2.new(0, 260, 0, 0)}
				AutomaticSize={Enum.AutomaticSize.Y}
				Position={UDim2.fromScale(0.5, 0.5)}
				AnchorPoint={Vector2.new(0.5, 0.5)}
				BackgroundColor3={Color3.fromRGB(28, 32, 38)}
			>
				<uicorner CornerRadius={UDim.new(0, 12)} />
				<uistroke Color={Color3.fromRGB(60, 64, 78)} Thickness={2} />
				<uipadding
					PaddingLeft={UDim.new(0, 20)}
					PaddingRight={UDim.new(0, 20)}
					PaddingTop={UDim.new(0, 20)}
					PaddingBottom={UDim.new(0, 20)}
				/>
				<uilistlayout
					FillDirection={Enum.FillDirection.Vertical}
					HorizontalAlignment={Enum.HorizontalAlignment.Center}
					Padding={UDim.new(0, 10)}
				/>
				<textlabel
					Name="Title"
					Size={UDim2.new(1, 0, 0, 26)}
					Text="loom CLI demo"
					TextColor3={Color3.fromRGB(235, 236, 240)}
					TextSize={20}
					Font={Enum.Font.GothamBold}
					BackgroundTransparency={1}
				/>
				<textlabel
					Name="Count"
					Size={UDim2.new(0, 0, 0, 0)}
					AutomaticSize={Enum.AutomaticSize.XY}
					Text={`ticks: ${count}`}
					TextColor3={Color3.fromRGB(140, 200, 255)}
					TextSize={34}
					Font={Enum.Font.GothamBold}
					BackgroundTransparency={1}
				/>
			</frame>
		</screengui>
	);
}
