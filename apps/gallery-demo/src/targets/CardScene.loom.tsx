// A static card: proves plain rendering + title upgrading in the gallery.

function CardScene() {
	return (
		<screengui Name="CardScene">
			<frame
				Name="Card"
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
					Padding={UDim.new(0, 10)}
				/>
				<textlabel
					Name="Title"
					Size={UDim2.new(1, 0, 0, 26)}
					Text="Card"
					TextColor3={Color3.fromRGB(235, 236, 240)}
					TextSize={20}
					Font={Enum.Font.GothamBold}
					BackgroundTransparency={1}
				/>
				<textlabel
					Name="Body"
					Size={UDim2.new(1, 0, 0, 0)}
					AutomaticSize={Enum.AutomaticSize.Y}
					Text="a static gallery target"
					TextColor3={Color3.fromRGB(150, 156, 168)}
					TextSize={14}
					Font={Enum.Font.Gotham}
					BackgroundTransparency={1}
				/>
			</frame>
		</screengui>
	);
}

export const preview = {
	render: () => <CardScene />,
	title: "Card (static)",
} as const;
