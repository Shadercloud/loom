// The post-2022 Roblox UI surface: `FontFace` weights instead of the legacy
// `Font` enum, `UIListLayout` flex distribution, `UIFlexItem` growth, a
// two-color `ColorSequence` gradient, and a `TweenService` hover transition.

// A roblox-ts source tree imports these from `@rbxts/services`, which the loom
// plugin aliases here; this demo is browser-native, so it imports them straight.
import { TweenService } from "@loom-dev/preview/services";

type Color3Value = InstanceType<typeof Color3>;
type TweenInfoValue = InstanceType<typeof TweenInfo>;
/** The tween surface this scene uses, without pulling in the runtime types. */
const tweenService = TweenService as unknown as {
	Create(
		target: unknown,
		info: TweenInfoValue,
		goals: Record<string, unknown>,
	): { Play(): void };
};

const FAMILY = "rbxasset://fonts/families/SourceSansPro.json";
const ACCENT = Color3.fromRGB(99, 102, 241);
const SURFACE = Color3.fromRGB(28, 32, 38);
const IDLE = Color3.fromRGB(45, 50, 60);

function Row(props: { children?: React.ReactNode; height?: number }) {
	return (
		<frame
			Size={UDim2.new(1, 0, 0, props.height ?? 44)}
			BackgroundColor3={Color3.fromRGB(20, 23, 28)}
		>
			<uicorner CornerRadius={UDim.new(0, 8)} />
			{props.children}
		</frame>
	);
}

function ModernRobloxScene() {
	// A tween on hover: the button's background eases to the accent color and
	// back, driven by TweenService on the scheduler's frame signal.
	let button: unknown;
	const tweenTo = (color: Color3Value) => {
		if (!button) return;
		tweenService
			.Create(
				button,
				new TweenInfo(0.18, Enum.EasingStyle.Quad, Enum.EasingDirection.Out),
				{ BackgroundColor3: color },
			)
			.Play();
	};

	return (
		<screengui Name="ModernRoblox">
			<frame
				Name="Panel"
				Size={UDim2.new(0, 420, 0, 300)}
				Position={UDim2.fromScale(0.5, 0.5)}
				AnchorPoint={Vector2.new(0.5, 0.5)}
				BackgroundColor3={SURFACE}
			>
				<uicorner CornerRadius={UDim.new(0, 12)} />
				<uistroke Color={Color3.fromRGB(60, 64, 78)} Thickness={1} />
				<uipadding
					PaddingLeft={UDim.new(0, 20)}
					PaddingRight={UDim.new(0, 20)}
					PaddingTop={UDim.new(0, 20)}
					PaddingBottom={UDim.new(0, 20)}
				/>
				<uilistlayout
					FillDirection={Enum.FillDirection.Vertical}
					Padding={UDim.new(0, 12)}
				/>

				{/* FontFace: one family, four weights. */}
				<textlabel
					Size={UDim2.new(1, 0, 0, 28)}
					Text="FontFace weights"
					TextColor3={Color3.fromRGB(235, 236, 240)}
					TextSize={22}
					TextXAlignment={Enum.TextXAlignment.Left}
					FontFace={new Font(FAMILY, Enum.FontWeight.Bold)}
					BackgroundTransparency={1}
				/>
				<Row height={28}>
					<uilistlayout
						FillDirection={Enum.FillDirection.Horizontal}
						VerticalAlignment={Enum.VerticalAlignment.Center}
						HorizontalFlex={Enum.UIFlexAlignment.SpaceBetween}
					/>
					{(
						[
							["Light", Enum.FontWeight.Light],
							["Regular", Enum.FontWeight.Regular],
							["SemiBold", Enum.FontWeight.SemiBold],
							["Heavy", Enum.FontWeight.Heavy],
						] as const
					).map(([label, weight]) => (
						<textlabel
							key={label}
							Size={UDim2.fromOffset(90, 24)}
							Text={label}
							TextColor3={Color3.fromRGB(200, 204, 214)}
							TextSize={16}
							FontFace={new Font(FAMILY, weight)}
							BackgroundTransparency={1}
						/>
					))}
				</Row>

				{/* Gradient: the two-color ColorSequence constructor. */}
				<frame
					Size={UDim2.new(1, 0, 0, 36)}
					BackgroundColor3={Color3.fromRGB(255, 255, 255)}
				>
					<uicorner CornerRadius={UDim.new(0, 8)} />
					<uigradient
						Color={new ColorSequence(ACCENT, Color3.fromRGB(56, 189, 248))}
						Rotation={90}
					/>
				</frame>

				{/* UIFlexItem: the middle cell swallows the leftover width. */}
				<Row>
					<uipadding
						PaddingLeft={UDim.new(0, 8)}
						PaddingRight={UDim.new(0, 8)}
						PaddingTop={UDim.new(0, 8)}
						PaddingBottom={UDim.new(0, 8)}
					/>
					<uilistlayout
						FillDirection={Enum.FillDirection.Horizontal}
						VerticalAlignment={Enum.VerticalAlignment.Center}
						Padding={UDim.new(0, 8)}
					/>
					<frame
						Size={UDim2.fromOffset(56, 28)}
						BackgroundColor3={Color3.fromRGB(45, 50, 60)}
					>
						<uicorner CornerRadius={UDim.new(0, 6)} />
					</frame>
					<frame
						Size={UDim2.fromOffset(0, 28)}
						BackgroundColor3={Color3.fromRGB(45, 50, 60)}
					>
						<uicorner CornerRadius={UDim.new(0, 6)} />
						<uiflexitem FlexMode={Enum.UIFlexMode.Fill} />
					</frame>
					<frame
						Size={UDim2.fromOffset(56, 28)}
						BackgroundColor3={Color3.fromRGB(45, 50, 60)}
					>
						<uicorner CornerRadius={UDim.new(0, 6)} />
					</frame>
				</Row>

				{/* TweenService: hover me. */}
				<textbutton
					ref={(instance) => {
						button = instance;
					}}
					Size={UDim2.new(1, 0, 0, 40)}
					Text="Hover to tween"
					TextColor3={Color3.fromRGB(255, 255, 255)}
					TextSize={16}
					FontFace={new Font(FAMILY, Enum.FontWeight.SemiBold)}
					BackgroundColor3={IDLE}
					Event={{
						MouseEnter: () => tweenTo(ACCENT),
						MouseLeave: () => tweenTo(IDLE),
					}}
				>
					<uicorner CornerRadius={UDim.new(0, 8)} />
				</textbutton>
			</frame>
		</screengui>
	);
}

export const preview = {
	render: () => <ModernRobloxScene />,
	title: "Modern Roblox (fonts, flex, tween)",
} as const;
