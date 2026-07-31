// Ripple under loom. `@rbxts/react-ripple` ships a Luau runtime and a `.d.ts`
// and nothing a browser can run; loom aliases both it and `@rbxts/ripple` to
// its own adapters, so this file imports the packages exactly as a Roblox
// project would — and the static gallery build resolves them the same way the
// dev server does.
//
// This is also the harness for the reported regression: `pnpm --filter
// @loom-dev/fumadocs-demo build` bundles this target, which used to die inside
// Rollup trying to parse `@rbxts/react-ripple/src/init.luau`.

import { useState } from "@rbxts/react";
import { config, useMotion, useSpring, useTween } from "@rbxts/react-ripple";

const SURFACE = Color3.fromRGB(24, 27, 33);
const ACCENT = Color3.fromRGB(88, 140, 255);
const ACCENT_HOT = Color3.fromRGB(255, 128, 92);
const TEXT = Color3.fromRGB(232, 234, 240);
const MUTED = Color3.fromRGB(140, 148, 165);

/** A button that springs its size, and tweens its color, on hover. */
function SpringButton() {
	// The canonical usage: a number spring mapped into a UDim2 prop. Sixty
	// property writes a second, zero React renders.
	const [offset, spring] = useSpring(0, config.stiff);
	const [tint, tween] = useTween(ACCENT, { duration: 0.25, easing: "quadOut" });

	return (
		<textbutton
			Name="SpringButton"
			Size={offset.map((value) => UDim2.fromOffset(200 + value, 48))}
			BackgroundColor3={tint}
			Text="hover me"
			TextColor3={TEXT}
			TextSize={16}
			Font={Enum.Font.GothamMedium}
			Event={{
				MouseEnter: () => {
					spring.setGoal(24);
					tween.setGoal(ACCENT_HOT);
				},
				MouseLeave: () => {
					spring.setGoal(0);
					tween.setGoal(ACCENT);
				},
			}}
		>
			<uicorner CornerRadius={UDim.new(0, 10)} />
		</textbutton>
	);
}

/** A panel that springs open and shut, driven by a record-valued motion. */
function MotionPanel() {
	const [open, setOpen] = useState(false);
	// A record of numbers animates key-wise — one controller for two properties.
	const [state, motion] = useMotion(
		{ height: 0, fade: 1 },
		{ spring: config.gentle },
	);

	return (
		<frame
			Name="MotionPanel"
			Size={UDim2.new(0, 260, 0, 0)}
			AutomaticSize={Enum.AutomaticSize.Y}
			BackgroundTransparency={1}
		>
			<uilistlayout
				FillDirection={Enum.FillDirection.Vertical}
				HorizontalAlignment={Enum.HorizontalAlignment.Center}
				Padding={UDim.new(0, 8)}
			/>
			<textbutton
				Name="Toggle"
				Size={UDim2.new(1, 0, 0, 40)}
				BackgroundColor3={Color3.fromRGB(46, 52, 64)}
				Text={open ? "collapse" : "expand"}
				TextColor3={TEXT}
				TextSize={15}
				Font={Enum.Font.GothamMedium}
				Event={{
					Activated: () => {
						const next = !open;
						setOpen(next);
						motion.setGoal({ height: next ? 96 : 0, fade: next ? 0 : 1 });
					},
				}}
			>
				<uicorner CornerRadius={UDim.new(0, 8)} />
			</textbutton>
			<frame
				Name="Drawer"
				Size={state.map((value) => UDim2.new(1, 0, 0, value.height))}
				BackgroundColor3={Color3.fromRGB(34, 39, 48)}
				BackgroundTransparency={state.map((value) => value.fade)}
				ClipsDescendants={true}
			>
				<uicorner CornerRadius={UDim.new(0, 8)} />
				<textlabel
					Name="Body"
					Size={UDim2.fromScale(1, 1)}
					BackgroundTransparency={1}
					Text={"springs, tweens and motions\nall run on loom's frame loop"}
					TextColor3={MUTED}
					TextSize={13}
					Font={Enum.Font.Gotham}
					TextWrapped={true}
					TextTransparency={state.map((value) => value.fade)}
				/>
			</frame>
		</frame>
	);
}

function RippleScene() {
	return (
		<screengui Name="RippleScene">
			<frame
				Name="Panel"
				Size={UDim2.new(0, 320, 0, 0)}
				AutomaticSize={Enum.AutomaticSize.Y}
				Position={UDim2.fromScale(0.5, 0.5)}
				AnchorPoint={Vector2.new(0.5, 0.5)}
				BackgroundColor3={SURFACE}
			>
				<uicorner CornerRadius={UDim.new(0, 14)} />
				<uistroke Color={Color3.fromRGB(52, 58, 70)} Thickness={1} />
				<uipadding
					PaddingLeft={UDim.new(0, 24)}
					PaddingRight={UDim.new(0, 24)}
					PaddingTop={UDim.new(0, 24)}
					PaddingBottom={UDim.new(0, 24)}
				/>
				<uilistlayout
					FillDirection={Enum.FillDirection.Vertical}
					HorizontalAlignment={Enum.HorizontalAlignment.Center}
					Padding={UDim.new(0, 16)}
				/>
				<textlabel
					Name="Title"
					Size={UDim2.new(1, 0, 0, 24)}
					BackgroundTransparency={1}
					Text="@rbxts/react-ripple"
					TextColor3={TEXT}
					TextSize={18}
					Font={Enum.Font.GothamBold}
				/>
				<SpringButton />
				<MotionPanel />
			</frame>
		</screengui>
	);
}

export const preview = {
	render: () => <RippleScene />,
	title: "Ripple (springs & motion)",
} as const;
