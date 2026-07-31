// The external failure pattern, as a gallery target: `@rbxts/react` class
// components with the `ReactComponent` / `ReactPureComponent` decorators, which
// is what the old hand-written shim could not export
// (`RollupError: "ReactComponent" is not exported by …/react-shim.js`).
//
// Kept in the demo gallery rather than only in a unit test because `vite build`
// eagerly follows every target: if the compatibility facade ever loses a name
// again, `pnpm --filter @loom-dev/gallery-demo build` fails right here. The
// finer-grained coverage (refs, forwardRef, bindings, Change, None) lives in
// `packages/preview/src/compat/react*.test.ts`.

import type { ReactNode } from "@rbxts/react";
import {
	Component,
	createContext,
	memo,
	PureComponent,
	ReactComponent,
	ReactPureComponent,
	useContext,
} from "@rbxts/react";

interface CounterState {
	count: number;
}

@ReactComponent
class Counter extends Component<Record<never, never>, CounterState> {
	override state: CounterState = { count: 0 };

	override render() {
		return (
			<textbutton
				Size={UDim2.new(1, 0, 0, 36)}
				Text={`Count: ${this.state.count}`}
				TextColor3={Color3.fromRGB(235, 236, 240)}
				TextSize={16}
				Font={Enum.Font.GothamBold}
				BackgroundColor3={Color3.fromRGB(58, 108, 246)}
				Tag="counter"
				Event={{
					Activated: () =>
						this.setState((state) => ({ count: state.count + 1 })),
				}}
			>
				<uicorner CornerRadius={UDim.new(0, 8)} />
			</textbutton>
		);
	}
}

@ReactPureComponent
class PureLabel extends PureComponent<{ readonly text: string }> {
	override render() {
		return (
			<textlabel
				Size={UDim2.new(1, 0, 0, 22)}
				Text={this.props.text}
				TextColor3={Color3.fromRGB(150, 156, 168)}
				TextSize={14}
				Font={Enum.Font.Gotham}
				BackgroundTransparency={1}
			/>
		);
	}
}

/** A class error boundary: a throwing child paints inline, not up the tree. */
class Boundary extends Component<
	{ readonly children?: ReactNode },
	{ failed: boolean }
> {
	override state = { failed: false };
	static getDerivedStateFromError() {
		return { failed: true };
	}
	override render() {
		return this.state.failed ? (
			<PureLabel text="error boundary caught the throw" />
		) : (
			<>{this.props.children}</>
		);
	}
}

function Thrower(): never {
	throw new Error("thrown on purpose");
}

const Theme = createContext("dark");

const ThemeLabel = memo(function ThemeLabel() {
	return <PureLabel text={`theme via context: ${useContext(Theme)}`} />;
});

function ReactClassScene() {
	return (
		<Theme.Provider value="light">
			<screengui Name="ReactClassScene">
				<frame
					Size={UDim2.new(0, 300, 0, 0)}
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
					<PureLabel text="Working" />
					<Counter />
					<ThemeLabel />
					<Boundary>
						<Thrower />
					</Boundary>
				</frame>
			</screengui>
		</Theme.Provider>
	);
}

export const preview = {
	title: "React class compatibility",
	render: () => <ReactClassScene />,
} as const;
