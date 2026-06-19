// M4 demo: a rounded, stroked, auto-sizing menu card with real text. The
// selected item cycles every second — exercising text + UICorner + UIStroke +
// UIPadding + UIListLayout + AutomaticSize through the live pipeline.
// Authored in roblox-ts style: hooks from @rbxts/react, datatypes as globals
// (UDim2/Color3/Enum/…). The loom Vite plugin aliases the imports and installs
// the globals so this runs unmodified in the browser.
import { useEffect, useState } from "@rbxts/react";

const ITEMS = ["Play", "Settings", "Inventory", "Shop", "Quit"];
const TEXT = Color3.fromRGB(235, 236, 240);

export function App() {
	const [tick, setTick] = useState(0);
	useEffect(() => {
		const handle = setInterval(() => setTick((t) => t + 1), 1000);
		return () => clearInterval(handle);
	}, []);
	const selected = tick % ITEMS.length;

	return (
		<screengui Name="App">
			<frame
				Name="Card"
				Size={UDim2.new(0, 320, 0, 0)}
				AutomaticSize={Enum.AutomaticSize.Y}
				Position={UDim2.fromScale(0.5, 0.5)}
				AnchorPoint={Vector2.new(0.5, 0.5)}
				BackgroundColor3={Color3.fromRGB(24, 26, 33)}
			>
				<uicorner CornerRadius={UDim.new(0, 14)} />
				<uistroke Color={Color3.fromRGB(60, 64, 78)} Thickness={2} />
				<uipadding
					PaddingLeft={UDim.new(0, 18)}
					PaddingRight={UDim.new(0, 18)}
					PaddingTop={UDim.new(0, 18)}
					PaddingBottom={UDim.new(0, 18)}
				/>
				<uilistlayout
					FillDirection={Enum.FillDirection.Vertical}
					Padding={UDim.new(0, 10)}
				/>
				<textlabel
					Name="Title"
					LayoutOrder={0}
					Size={UDim2.new(1, 0, 0, 30)}
					Text="MAIN MENU"
					TextColor3={TEXT}
					TextSize={20}
					Font={Enum.Font.GothamBold}
					TextXAlignment={Enum.TextXAlignment.Left}
					BackgroundTransparency={1}
				/>
				{ITEMS.map((label, i) => (
					<frame
						key={label}
						Name={`Item_${label}`}
						LayoutOrder={i + 1}
						Size={UDim2.new(1, 0, 0, 44)}
						BackgroundColor3={
							i === selected
								? Color3.fromRGB(88, 101, 242)
								: Color3.fromRGB(38, 41, 51)
						}
					>
						<uicorner CornerRadius={UDim.new(0, 8)} />
						{i === selected && (
							<uigradient
								Rotation={20}
								Color={ColorSequence.new(
									Color3.fromRGB(99, 102, 241),
									Color3.fromRGB(168, 85, 247),
								)}
							/>
						)}
						<textlabel
							Name="Label"
							Size={UDim2.fromScale(1, 1)}
							Text={label}
							TextColor3={TEXT}
							TextSize={16}
							Font={Enum.Font.GothamMedium}
							TextXAlignment={Enum.TextXAlignment.Center}
							BackgroundTransparency={1}
						/>
					</frame>
				))}
				{/* Auto-sizes to its (changing) text via measured TextBounds. */}
				<frame
					Name="StatusPill"
					LayoutOrder={99}
					Size={UDim2.new(0, 0, 0, 0)}
					AutomaticSize={Enum.AutomaticSize.XY}
					BackgroundColor3={Color3.fromRGB(45, 48, 58)}
				>
					<uicorner CornerRadius={UDim.new(0, 6)} />
					<uipadding
						PaddingLeft={UDim.new(0, 12)}
						PaddingRight={UDim.new(0, 12)}
						PaddingTop={UDim.new(0, 6)}
						PaddingBottom={UDim.new(0, 6)}
					/>
					<textlabel
						Name="PillText"
						Size={UDim2.new(0, 0, 0, 0)}
						AutomaticSize={Enum.AutomaticSize.XY}
						Text={`▶ ${ITEMS[selected]}`}
						TextColor3={TEXT}
						TextSize={14}
						Font={Enum.Font.GothamMedium}
						BackgroundTransparency={1}
					/>
				</frame>
			</frame>
		</screengui>
	);
}
