// Built-in `@rbxts/ui-labs` compatibility, with no loom configuration at all:
// no `shims` entry, no local compat file, and the package itself isn't even
// installed here. Loom aliases the root import to its own non-story
// `Environment`, so the usual reusable-input guard below picks loom's
// `UserInputService` — exactly as UI Labs behaves outside a story.
import { UserInputService } from "@rbxts/services";
import { Environment } from "@rbxts/ui-labs";

const InputService = Environment.IsStory()
	? Environment.InputListener
	: UserInputService;

const usingLoomService = InputService === UserInputService;

function UiLabsScene() {
	return (
		<screengui Name="UiLabsScene">
			<frame
				Name="Panel"
				Size={UDim2.new(0, 360, 0, 0)}
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
					Padding={UDim.new(0, 10)}
				/>
				<textlabel
					Name="Status"
					Size={UDim2.new(1, 0, 0, 50)}
					Text={
						usingLoomService
							? "Using Loom UserInputService"
							: "Unexpected input service"
					}
					TextColor3={
						usingLoomService
							? Color3.fromRGB(134, 239, 172)
							: Color3.fromRGB(248, 113, 113)
					}
					TextSize={18}
					Font={Enum.Font.GothamMedium}
					BackgroundTransparency={1}
				/>
				<textlabel
					Name="IsStory"
					Size={UDim2.new(1, 0, 0, 24)}
					Text={`Environment.IsStory() → ${Environment.IsStory()}`}
					TextColor3={Color3.fromRGB(160, 166, 180)}
					TextSize={14}
					BackgroundTransparency={1}
				/>
				<textlabel
					Name="InputListener"
					Size={UDim2.new(1, 0, 0, 24)}
					Text={`Environment.InputListener → ${Environment.InputListener === undefined ? "undefined" : "present"}`}
					TextColor3={Color3.fromRGB(160, 166, 180)}
					TextSize={14}
					BackgroundTransparency={1}
				/>
			</frame>
		</screengui>
	);
}

export const preview = {
	render: () => <UiLabsScene />,
	title: "UI Labs compatibility",
} as const;
