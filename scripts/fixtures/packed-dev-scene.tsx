/**
 * The scene `packed-dev-test.mjs` copies into its fixture app.
 *
 * The reported shape, structurally: a wrapping row of `45%` columns, each an
 * auto-sizing card whose vertical list fills the cross axis, a padded auto
 * container inside a flex item for the body, and a footer with an irreducible
 * two-button minimum. The nesting is the point — `wrapWidth` resolves the width
 * wrapped text wraps at by walking exactly this chain, and every frame between
 * the label and the `45%` column is auto-sized, i.e. sized *by* the label.
 *
 * A real file rather than a string inside the script: it is JSX full of `${}`
 * and backticks, and escaping that through a template literal is how you get a
 * fixture nobody can edit.
 */
const BODY = "View player information, statistics, and recent activity.";

const Pad = ({ px }: { px: number }) => (
	<uipadding
		PaddingLeft={UDim.new(0, px)}
		PaddingRight={UDim.new(0, px)}
		PaddingTop={UDim.new(0, px)}
		PaddingBottom={UDim.new(0, px)}
	/>
);

const Label = (p: { name: string; text: string; size: number; lh: number }) => (
	<textlabel
		Name={p.name}
		Size={UDim2.fromScale(0, 0)}
		AutomaticSize={Enum.AutomaticSize.XY}
		BackgroundTransparency={1}
		Text={p.text}
		TextSize={p.size}
		LineHeight={p.lh}
		TextWrapped={true}
		RichText={true}
	/>
);

const Button = ({ text }: { text: string }) => (
	<frame Size={UDim2.fromScale(0, 0)} AutomaticSize={Enum.AutomaticSize.XY}>
		<Pad px={10} />
		<Label name={`Btn_${text}`} text={text} size={18} lh={1.4} />
	</frame>
);

function Card({ i }: { i: number }) {
	return (
		<frame
			Name={`Col${i}`}
			Size={UDim2.new(0.45, 0, 0, 0)}
			AutomaticSize={Enum.AutomaticSize.Y}
			BackgroundTransparency={1}
		>
			<frame
				Name={`Card${i}`}
				Size={UDim2.fromScale(1, 1)}
				AutomaticSize={Enum.AutomaticSize.XY}
			>
				<uilistlayout
					FillDirection={Enum.FillDirection.Vertical}
					HorizontalFlex={Enum.UIFlexAlignment.Fill}
					SortOrder={Enum.SortOrder.LayoutOrder}
				/>
				<frame
					LayoutOrder={0}
					Size={UDim2.fromScale(0, 0)}
					AutomaticSize={Enum.AutomaticSize.XY}
				>
					<Pad px={12} />
					<Label
						name={`Header${i}`}
						text="Player Profile"
						size={24}
						lh={1.25}
					/>
				</frame>
				<frame
					LayoutOrder={1}
					Size={UDim2.fromScale(0, 0)}
					AutomaticSize={Enum.AutomaticSize.XY}
				>
					<uiflexitem FlexMode={Enum.UIFlexMode.Grow} />
					<uilistlayout FillDirection={Enum.FillDirection.Horizontal} />
					<frame
						Size={UDim2.fromScale(0, 0)}
						AutomaticSize={Enum.AutomaticSize.XY}
					>
						<Pad px={12} />
						<Label name={`Body${i}`} text={BODY} size={18} lh={1.4} />
					</frame>
				</frame>
				<frame
					LayoutOrder={2}
					Size={UDim2.fromScale(0, 0)}
					AutomaticSize={Enum.AutomaticSize.XY}
				>
					<Pad px={12} />
					<uilistlayout
						FillDirection={Enum.FillDirection.Horizontal}
						Wraps={true}
					/>
					<Button text="Cancel" />
					<Button text="Save" />
				</frame>
			</frame>
		</frame>
	);
}

export function App() {
	return (
		<screengui Name="App">
			<frame
				Name="Row"
				Size={UDim2.new(0.9, 0, 1, 0)}
				BackgroundTransparency={1}
			>
				<uilistlayout
					FillDirection={Enum.FillDirection.Horizontal}
					Wraps={true}
				/>
				{[0, 1, 2, 3, 4].map((i) => (
					<Card key={`col${i}`} i={i} />
				))}
			</frame>
		</screengui>
	);
}
