// Phase 2 interactive demo: an Activated counter with pressed styling, a hover
// swatch (MouseEnter/MouseLeave), and a motion box driven by RenderStepped
// writing Position directly through a ref — no React commits per frame.
import type { InputObject, LoomInstance, LoomSignal } from "@loom-dev/runtime";
import { useEffect, useRef, useState } from "@rbxts/react";

const isMouse = (input: InputObject) =>
	input.UserInputType === Enum.UserInputType.MouseButton1 ||
	input.UserInputType === Enum.UserInputType.Touch;

export function App() {
	const [count, setCount] = useState(0);
	const [pressed, setPressed] = useState(false);
	const [hovered, setHovered] = useState(false);
	const motionRef = useRef<LoomInstance>(null);

	// Motion without React: RenderStepped writes Position on the live instance;
	// the dirty write flushes on the scheduler frame, not through a commit.
	useEffect(() => {
		const RunService = game.GetService("RunService");
		const renderStepped = RunService.RenderStepped as LoomSignal<[number]>;
		let t = 0;
		const connection = renderStepped.Connect((dt) => {
			t += dt;
			const box = motionRef.current;
			if (box) {
				box.Position = UDim2.new(0.5, Math.sin(t * 2) * 140, 0, 320);
			}
		});
		return () => connection.Disconnect();
	}, []);

	return (
		<screengui Name="Interactive">
			<frame
				Name="Panel"
				Size={UDim2.new(0, 320, 0, 0)}
				AutomaticSize={Enum.AutomaticSize.Y}
				Position={UDim2.new(0.5, 0, 0, 40)}
				AnchorPoint={Vector2.new(0.5, 0)}
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
					Name="Title"
					Size={UDim2.new(1, 0, 0, 26)}
					Text="loom interactive demo"
					TextColor3={Color3.fromRGB(235, 236, 240)}
					TextSize={20}
					Font={Enum.Font.GothamBold}
					BackgroundTransparency={1}
				/>
				<textbutton
					Name="Counter"
					Size={UDim2.new(1, 0, 0, 44)}
					Text={`clicked ${count} times`}
					TextColor3={Color3.fromRGB(235, 236, 240)}
					TextSize={16}
					Font={Enum.Font.GothamMedium}
					BackgroundColor3={
						pressed ? Color3.fromRGB(46, 90, 180) : Color3.fromRGB(58, 116, 235)
					}
					Event={{
						Activated: () => setCount((current) => current + 1),
						InputBegan: (_rbx: LoomInstance, input: InputObject) => {
							if (isMouse(input)) setPressed(true);
						},
						InputEnded: (_rbx: LoomInstance, input: InputObject) => {
							if (isMouse(input)) setPressed(false);
						},
					}}
				>
					<uicorner CornerRadius={UDim.new(0, 8)} />
				</textbutton>
				<frame
					Name="Swatch"
					Size={UDim2.new(1, 0, 0, 44)}
					BackgroundColor3={
						hovered ? Color3.fromRGB(120, 220, 160) : Color3.fromRGB(52, 58, 66)
					}
					Event={{
						MouseEnter: () => setHovered(true),
						MouseLeave: () => setHovered(false),
					}}
				>
					<uicorner CornerRadius={UDim.new(0, 8)} />
					<textlabel
						Name="SwatchLabel"
						Size={UDim2.new(1, 0, 1, 0)}
						Text={hovered ? "hovered!" : "hover me"}
						TextColor3={
							hovered
								? Color3.fromRGB(20, 24, 28)
								: Color3.fromRGB(180, 186, 196)
						}
						TextSize={14}
						Font={Enum.Font.Gotham}
						BackgroundTransparency={1}
					/>
				</frame>
			</frame>
			<frame
				Name="MotionBox"
				ref={motionRef}
				Size={UDim2.new(0, 56, 0, 56)}
				Position={UDim2.new(0.5, 0, 0, 320)}
				AnchorPoint={Vector2.new(0.5, 0)}
				BackgroundColor3={Color3.fromRGB(240, 140, 90)}
			>
				<uicorner CornerRadius={UDim.new(0, 12)} />
			</frame>
		</screengui>
	);
}
