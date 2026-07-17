// Phase 2 interactive demo: an Activated counter with pressed styling, a hover
// swatch (MouseEnter/MouseLeave), and a motion box driven by RenderStepped
// writing Position directly through a ref — no React commits per frame.
// Phase 3 additions: a live TextBox (real <input>) mirrored into a label via
// Change.Text, and a selectable button (GuiService.SelectedObject) that counts
// Space presses through element-routed keyboard InputBegan.
// Phase 4 addition: a dialog rendered via createPortal into PlayerGui as its
// own <screengui DisplayOrder={2000}> sibling layer, dismissed on outside
// click through UserInputService.InputBegan + PlayerGui.GetGuiObjectsAtPosition
// (a mini version of lattice's DismissableLayer logic).
import { createPortal } from "@loom-dev/react";
import type { InputObject, LoomInstance, LoomSignal } from "@loom-dev/runtime";
import { useEffect, useRef, useState } from "@rbxts/react";

const isMouse = (input: InputObject) =>
	input.UserInputType === Enum.UserInputType.MouseButton1 ||
	input.UserInputType === Enum.UserInputType.Touch;

const getPlayerGui = (): LoomInstance =>
	(game.GetService("Players").LocalPlayer as LoomInstance).WaitForChild(
		"PlayerGui",
	) as LoomInstance;

export function App() {
	const [count, setCount] = useState(0);
	const [pressed, setPressed] = useState(false);
	const [hovered, setHovered] = useState(false);
	const [typed, setTyped] = useState("");
	const [selectedName, setSelectedName] = useState<string | undefined>(
		undefined,
	);
	const [spaceCount, setSpaceCount] = useState(0);
	const [dialogOpen, setDialogOpen] = useState(false);
	const motionRef = useRef<LoomInstance>(null);
	const selectRef = useRef<LoomInstance>(null);
	const panelRef = useRef<LoomInstance>(null);

	// Outside-click dismiss: on any global press, hit-test the point against
	// PlayerGui; if the dialog panel isn't in the stack, close. This is the same
	// chain lattice's DismissableLayer uses (UserInputService.InputBegan →
	// GetGuiObjectsAtPosition → IsDescendantOf).
	useEffect(() => {
		if (!dialogOpen) return;
		const userInputService = game.GetService("UserInputService");
		const playerGui = getPlayerGui();
		const connection = (
			userInputService.InputBegan as LoomSignal<[InputObject, boolean]>
		).Connect((input) => {
			if (!isMouse(input)) return;
			const panel = panelRef.current;
			if (!panel) return;
			const objects = (
				playerGui.GetGuiObjectsAtPosition as (
					x: number,
					y: number,
				) => LoomInstance[]
			)(input.Position.X, input.Position.Y);
			const insidePanel = objects.some(
				(obj) => obj === panel || obj.IsDescendantOf(panel),
			);
			if (!insidePanel) setDialogOpen(false);
		});
		return () => connection.Disconnect();
	}, [dialogOpen]);

	// Mirror GuiService.SelectedObject into local state by name.
	useEffect(() => {
		const guiService = game.GetService("GuiService");
		const connection = guiService
			.GetPropertyChangedSignal("SelectedObject")
			.Connect(() => {
				const selected = guiService.SelectedObject as LoomInstance | undefined;
				setSelectedName(selected ? String(selected.Name) : undefined);
			});
		return () => connection.Disconnect();
	}, []);

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
				box.Position = UDim2.new(0.5, Math.sin(t * 2) * 140, 1, -80);
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
				<textbox
					Name="Input"
					Size={UDim2.new(1, 0, 0, 36)}
					PlaceholderText="type something..."
					ClearTextOnFocus={false}
					Text=""
					TextColor3={Color3.fromRGB(235, 236, 240)}
					TextSize={14}
					TextXAlignment={Enum.TextXAlignment.Left}
					Font={Enum.Font.Gotham}
					BackgroundColor3={Color3.fromRGB(40, 46, 56)}
					Change={{
						Text: (rbx: LoomInstance) => setTyped(String(rbx.Text ?? "")),
					}}
				>
					<uicorner CornerRadius={UDim.new(0, 8)} />
				</textbox>
				<textlabel
					Name="Mirror"
					Size={UDim2.new(1, 0, 0, 18)}
					Text={typed === "" ? "(nothing typed yet)" : `typed: ${typed}`}
					TextColor3={Color3.fromRGB(150, 158, 172)}
					TextSize={13}
					Font={Enum.Font.Gotham}
					BackgroundTransparency={1}
				/>
				<textbutton
					Name="Selectable"
					ref={selectRef}
					Size={UDim2.new(1, 0, 0, 36)}
					Text={
						selectedName === "Selectable"
							? `selected — Space pressed ${spaceCount}x`
							: "select me"
					}
					TextColor3={Color3.fromRGB(235, 236, 240)}
					TextSize={14}
					Font={Enum.Font.GothamMedium}
					BackgroundColor3={
						selectedName === "Selectable"
							? Color3.fromRGB(96, 66, 200)
							: Color3.fromRGB(70, 76, 88)
					}
					Event={{
						Activated: () => {
							game.GetService("GuiService").SelectedObject = selectRef.current;
						},
						InputBegan: (_rbx: LoomInstance, input: InputObject) => {
							if (input.KeyCode === Enum.KeyCode.Space) {
								setSpaceCount((current) => current + 1);
							}
						},
					}}
				>
					<uicorner CornerRadius={UDim.new(0, 8)} />
				</textbutton>
				<textlabel
					Name="SelectionStatus"
					Size={UDim2.new(1, 0, 0, 18)}
					Text={
						selectedName === undefined
							? "nothing selected"
							: `SelectedObject: ${selectedName}`
					}
					TextColor3={Color3.fromRGB(150, 158, 172)}
					TextSize={13}
					Font={Enum.Font.Gotham}
					BackgroundTransparency={1}
				/>
				<textbutton
					Name="OpenDialog"
					Size={UDim2.new(1, 0, 0, 40)}
					Text={dialogOpen ? "dialog is open" : "open dialog (portal)"}
					TextColor3={Color3.fromRGB(235, 236, 240)}
					TextSize={15}
					Font={Enum.Font.GothamMedium}
					BackgroundColor3={
						dialogOpen
							? Color3.fromRGB(50, 56, 66)
							: Color3.fromRGB(196, 92, 60)
					}
					Event={{ Activated: () => setDialogOpen(true) }}
				>
					<uicorner CornerRadius={UDim.new(0, 8)} />
				</textbutton>
			</frame>
			<frame
				Name="MotionBox"
				ref={motionRef}
				Size={UDim2.new(0, 56, 0, 56)}
				Position={UDim2.new(0.5, 0, 1, -80)}
				AnchorPoint={Vector2.new(0.5, 0)}
				BackgroundColor3={Color3.fromRGB(240, 140, 90)}
			>
				<uicorner CornerRadius={UDim.new(0, 12)} />
			</frame>
			{dialogOpen &&
				createPortal(
					<screengui
						Name="DialogLayer"
						DisplayOrder={2000}
						IgnoreGuiInset={true}
						ResetOnSpawn={false}
						ZIndexBehavior={Enum.ZIndexBehavior.Sibling}
					>
						<frame
							Name="Backdrop"
							Size={UDim2.new(1, 0, 1, 0)}
							BackgroundColor3={Color3.fromRGB(8, 10, 14)}
							BackgroundTransparency={0.45}
						>
							<frame
								Name="DialogPanel"
								ref={panelRef}
								Size={UDim2.new(0, 320, 0, 168)}
								Position={UDim2.new(0.5, 0, 0.5, 0)}
								AnchorPoint={Vector2.new(0.5, 0.5)}
								BackgroundColor3={Color3.fromRGB(34, 38, 46)}
							>
								<uicorner CornerRadius={UDim.new(0, 12)} />
								<uistroke Color={Color3.fromRGB(70, 76, 92)} Thickness={2} />
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
									Name="DialogTitle"
									Size={UDim2.new(1, 0, 0, 24)}
									Text="portal dialog"
									TextColor3={Color3.fromRGB(235, 236, 240)}
									TextSize={18}
									Font={Enum.Font.GothamBold}
									BackgroundTransparency={1}
								/>
								<textlabel
									Name="DialogBody"
									Size={UDim2.new(1, 0, 0, 36)}
									Text={
										"rendered into PlayerGui via createPortal.\nclick outside to dismiss."
									}
									TextColor3={Color3.fromRGB(170, 176, 190)}
									TextSize={13}
									TextWrapped={true}
									Font={Enum.Font.Gotham}
									BackgroundTransparency={1}
								/>
								<textbutton
									Name="CloseDialog"
									Size={UDim2.new(1, 0, 0, 36)}
									Text="close"
									TextColor3={Color3.fromRGB(235, 236, 240)}
									TextSize={14}
									Font={Enum.Font.GothamMedium}
									BackgroundColor3={Color3.fromRGB(58, 116, 235)}
									Event={{ Activated: () => setDialogOpen(false) }}
								>
									<uicorner CornerRadius={UDim.new(0, 8)} />
								</textbutton>
							</frame>
						</frame>
					</screengui>,
					getPlayerGui(),
				)}
		</screengui>
	);
}
