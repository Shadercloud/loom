// An interactive counter: proves Event.Activated wiring survives the gallery
// mount path (createRoot per target + error boundary wrapper).
import { useState } from "@rbxts/react";

function CounterScene() {
	const [count, setCount] = useState(0);
	return (
		<screengui Name="CounterScene">
			<frame
				Name="Panel"
				Size={UDim2.new(0, 280, 0, 0)}
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
					Padding={UDim.new(0, 12)}
				/>
				<textlabel
					Name="Count"
					Size={UDim2.new(1, 0, 0, 40)}
					Text={`count: ${count}`}
					TextColor3={Color3.fromRGB(140, 200, 255)}
					TextSize={28}
					Font={Enum.Font.GothamBold}
					BackgroundTransparency={1}
				/>
				<textbutton
					Name="Increment"
					Size={UDim2.new(1, 0, 0, 44)}
					Text="click me"
					TextColor3={Color3.fromRGB(235, 236, 240)}
					TextSize={16}
					Font={Enum.Font.GothamMedium}
					BackgroundColor3={Color3.fromRGB(58, 116, 235)}
					Event={{
						Activated: () => setCount((current) => current + 1),
					}}
				>
					<uicorner CornerRadius={UDim.new(0, 8)} />
				</textbutton>
			</frame>
		</screengui>
	);
}

export const preview = {
	render: () => <CounterScene />,
	title: "Counter (Activated)",
} as const;
