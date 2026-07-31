// The reported compatibility regression, as a scene. An external roblox-ts
// project generates component ids with `HttpService:GenerateGUID` and defines a
// theme with hexadecimal colors; both used to fail in the browser — the import
// with "does not provide an export named HttpService", the theme with
// "Color3.fromHex is not a function".
//
// The service is imported exactly the way that project imports it, through
// `@rbxts/services` (which loom aliases), not through
// `@loom-dev/preview/services` — the alias module is the half that was missing.
import { HttpService } from "@rbxts/services";

const ACCENT = Color3.fromHex("#6366F1");
const ID = HttpService.GenerateGUID(false);

function HttpColorScene() {
	return (
		<screengui Name="HttpColorScene">
			<frame
				Name={`Card-${ID}`}
				Size={UDim2.fromOffset(360, 0)}
				AutomaticSize={Enum.AutomaticSize.Y}
				Position={UDim2.fromScale(0.5, 0.5)}
				AnchorPoint={Vector2.new(0.5, 0.5)}
				BackgroundColor3={ACCENT}
			>
				<uicorner CornerRadius={UDim.new(0, 12)} />
				<uipadding
					PaddingLeft={UDim.new(0, 20)}
					PaddingRight={UDim.new(0, 20)}
					PaddingTop={UDim.new(0, 20)}
					PaddingBottom={UDim.new(0, 20)}
				/>
				<uilistlayout
					FillDirection={Enum.FillDirection.Vertical}
					Padding={UDim.new(0, 8)}
				/>
				<textlabel
					Name="Title"
					Size={UDim2.new(1, 0, 0, 26)}
					Text="HttpService and Color3"
					TextColor3={Color3.fromHex("FFFFFF")}
					TextSize={20}
					Font={Enum.Font.GothamBold}
					BackgroundTransparency={1}
				/>
				<textlabel
					Name="Guid"
					Size={UDim2.new(1, 0, 0, 22)}
					Text={ID}
					TextColor3={Color3.fromHex("#E0E7FF")}
					TextSize={14}
					Font={Enum.Font.Code}
					BackgroundTransparency={1}
				/>
				<textlabel
					Name="Accent"
					Size={UDim2.new(1, 0, 0, 22)}
					Text='Color3.fromHex("#6366F1")'
					TextColor3={Color3.fromHex("#E0E7FF")}
					TextSize={14}
					BackgroundTransparency={1}
				/>
			</frame>
		</screengui>
	);
}

export const preview = {
	title: "HttpService and Color3",
	render: () => <HttpColorScene />,
} as const;
