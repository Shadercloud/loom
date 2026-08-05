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
 * Below it, the paragraph from the issue itself (`CardLong.loom.tsx`): one
 * `90%` container, one auto-sizing card, one label of ~900 characters. A short
 * label crosses one wrap boundary and can be right by accident — the sizes it
 * could settle at are few and far apart. This one crosses forty of them, so a
 * font a few percent off, a stale measurement, or a width resolved through the
 * wrong ancestor all show up as a line count that differs from the engine's.
 *
 * A real file rather than a string inside the script: it is JSX full of `${}`
 * and backticks, and escaping that through a template literal is how you get a
 * fixture nobody can edit.
 */
const BODY = "View player information, statistics, and recent activity.";

/** The paragraph from issue #11, verbatim. */
const LONG =
	"Far far away, behind the word mountains, far from the countries Vokalia " +
	"and Consonantia, there live the blind texts. Separated they live in " +
	"Bookmarksgrove right at the coast of the Semantics, a large language " +
	"ocean. A small river named Duden flows by their place and supplies it " +
	"with the necessary regelialia. It is a paradisematic country, in which " +
	"roasted parts of sentences fly into your mouth. Even the all-powerful " +
	"Pointing has no control about the blind texts it is an almost " +
	"unorthographic life One day however a small line of blind text by the " +
	"name of Lorem Ipsum decided to leave for the far World of Grammar. The " +
	"Big Oxmox advised her not to do so, because there were thousands of bad " +
	"Commas, wild Question Marks and devious Semikoli, but the Little Blind " +
	"Text didn't listen. She packed her seven versalia, put her initial into " +
	"the belt and made herself on the way.";

const Pad = ({ px }: { px: number }) => (
	<uipadding
		PaddingLeft={UDim.new(0, px)}
		PaddingRight={UDim.new(0, px)}
		PaddingTop={UDim.new(0, px)}
		PaddingBottom={UDim.new(0, px)}
	/>
);

/**
 * Every label names a font loom actually registers a face for
 * (`@loom-dev/renderer/fonts` ships Source Sans 3 for `SourceSans`). Without
 * one the family falls through to the generic sans stack, which is the same
 * whether or not the face ever loaded — and a fixture that never reaches a
 * registered face cannot tell a working font pipeline from a broken one.
 */
const Label = (p: { name: string; text: string; size: number; lh: number }) => (
	<textlabel
		Name={p.name}
		Size={UDim2.fromScale(0, 0)}
		AutomaticSize={Enum.AutomaticSize.XY}
		BackgroundTransparency={1}
		Font={Enum.Font.SourceSans}
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

/**
 * Issue #11's `CardLong.loom.tsx`: a `90%` container holding an auto-sizing
 * card, whose header, body and footer are each auto-sizing too. The body label
 * is the paragraph, and the only node in the chain with a width of its own is
 * the container — so `wrapWidth` has to walk past three automatic ancestors to
 * find it.
 */
function LongCard() {
	return (
		<frame
			Name="LongContainer"
			Size={UDim2.new(0.9, 0, 0, 0)}
			AutomaticSize={Enum.AutomaticSize.Y}
			BackgroundTransparency={1}
		>
			<frame
				Name="LongCard"
				Size={UDim2.fromScale(1, 0)}
				AutomaticSize={Enum.AutomaticSize.Y}
			>
				<uilistlayout
					FillDirection={Enum.FillDirection.Vertical}
					HorizontalFlex={Enum.UIFlexAlignment.Fill}
					SortOrder={Enum.SortOrder.LayoutOrder}
				/>
				<frame
					Name="LongHeader"
					LayoutOrder={0}
					Size={UDim2.fromScale(0, 0)}
					AutomaticSize={Enum.AutomaticSize.XY}
				>
					<Pad px={12} />
					<Label
						name="LongHeaderText"
						text="Player Profile"
						size={24}
						lh={1.25}
					/>
				</frame>
				<frame
					Name="LongBody"
					LayoutOrder={1}
					Size={UDim2.fromScale(0, 0)}
					AutomaticSize={Enum.AutomaticSize.XY}
				>
					<Pad px={12} />
					<Label name="LongBodyText" text={LONG} size={18} lh={1.4} />
				</frame>
				<frame
					Name="LongFooter"
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
				Name="Page"
				Size={UDim2.fromScale(1, 1)}
				BackgroundTransparency={1}
			>
				<uilistlayout
					FillDirection={Enum.FillDirection.Vertical}
					HorizontalAlignment={Enum.HorizontalAlignment.Center}
					SortOrder={Enum.SortOrder.LayoutOrder}
				/>
				<frame
					Name="Row"
					LayoutOrder={0}
					Size={UDim2.new(0.9, 0, 0, 0)}
					AutomaticSize={Enum.AutomaticSize.Y}
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
				<LongCard />
			</frame>
		</screengui>
	);
}
