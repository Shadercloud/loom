// Every ScaleType, plus the sprite window and the tint. The sources are inline
// SVG data URLs rather than `rbxassetid://` so the scene paints identically with
// no dev server, no network and no asset ids to moderate.

const DARK = Color3.fromRGB(28, 32, 38);
const LINE = Color3.fromRGB(60, 64, 78);
const TEXT = Color3.fromRGB(235, 236, 240);
const MUTED = Color3.fromRGB(150, 156, 168);

const svg = (body: string, w: number, h: number) =>
	`data:image/svg+xml,${encodeURIComponent(
		`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`,
	)}`;

/** A 32x32 panel with an 8px frame: the classic 9-slice source. */
const PANEL = svg(
	'<rect width="32" height="32" rx="8" fill="#2b6cff"/>' +
		'<rect x="8" y="8" width="16" height="16" fill="#0f1420"/>',
	32,
	32,
);

/** The same panel in white, so a tint multiplies to exactly the tint colour. */
const WHITE_PANEL = svg(
	'<rect width="32" height="32" rx="8" fill="#ffffff"/>' +
		'<rect x="8" y="8" width="16" height="16" fill="#9aa3b2"/>',
	32,
	32,
);

/** A 100x50 sheet of five 20x50 sprites; the scene windows the middle one. */
const SHEET = svg(
	["#ef4444", "#f59e0b", "#22c55e", "#38bdf8", "#a855f7"]
		.map(
			(fill, i) =>
				`<rect x="${i * 20}" width="20" height="50" fill="${fill}"/>` +
				`<circle cx="${i * 20 + 10}" cy="25" r="6" fill="#0f1420"/>`,
		)
		.join(""),
	100,
	50,
);

/** A 16x16 checker, so tiling is unmistakable. */
const CHECKER = svg(
	'<rect width="16" height="16" fill="#1b2130"/>' +
		'<rect width="8" height="8" fill="#3b4763"/>' +
		'<rect x="8" y="8" width="8" height="8" fill="#3b4763"/>',
	16,
	16,
);

/** One labelled swatch, so each mode says which one it is. */
function Swatch(props: {
	label: string;
	order: number;
	children?: React.ReactNode;
}) {
	return (
		<frame
			Name={props.label}
			LayoutOrder={props.order}
			Size={UDim2.new(0, 120, 0, 104)}
			BackgroundTransparency={1}
		>
			<uilistlayout
				FillDirection={Enum.FillDirection.Vertical}
				HorizontalAlignment={Enum.HorizontalAlignment.Center}
				Padding={UDim.new(0, 6)}
				SortOrder={Enum.SortOrder.LayoutOrder}
			/>
			<frame
				Name="Well"
				LayoutOrder={1}
				Size={UDim2.new(0, 120, 0, 76)}
				BackgroundColor3={Color3.fromRGB(18, 21, 27)}
			>
				<uicorner CornerRadius={UDim.new(0, 6)} />
				{props.children}
			</frame>
			<textlabel
				Name="Label"
				LayoutOrder={2}
				Size={UDim2.new(1, 0, 0, 16)}
				Text={props.label}
				TextColor3={MUTED}
				TextSize={12}
				Font={Enum.Font.Gotham}
				BackgroundTransparency={1}
			/>
		</frame>
	);
}

function ImageModesScene() {
	return (
		<screengui Name="ImageModesScene">
			<frame
				Name="Root"
				Size={UDim2.new(0, 420, 0, 0)}
				AutomaticSize={Enum.AutomaticSize.Y}
				Position={UDim2.fromScale(0.5, 0.5)}
				AnchorPoint={Vector2.new(0.5, 0.5)}
				BackgroundColor3={DARK}
			>
				<uicorner CornerRadius={UDim.new(0, 12)} />
				<uistroke Color={LINE} Thickness={2} />
				<uipadding
					PaddingLeft={UDim.new(0, 20)}
					PaddingRight={UDim.new(0, 20)}
					PaddingTop={UDim.new(0, 20)}
					PaddingBottom={UDim.new(0, 20)}
				/>
				<uilistlayout
					FillDirection={Enum.FillDirection.Vertical}
					Padding={UDim.new(0, 12)}
					SortOrder={Enum.SortOrder.LayoutOrder}
				/>
				<textlabel
					Name="Heading"
					LayoutOrder={1}
					Size={UDim2.new(1, 0, 0, 20)}
					Text="ScaleType, sprite windows and tints"
					TextColor3={TEXT}
					TextSize={15}
					TextXAlignment={Enum.TextXAlignment.Left}
					Font={Enum.Font.GothamBold}
					BackgroundTransparency={1}
				/>

				<frame
					Name="Row1"
					LayoutOrder={2}
					Size={UDim2.new(1, 0, 0, 104)}
					BackgroundTransparency={1}
				>
					<uilistlayout
						FillDirection={Enum.FillDirection.Horizontal}
						HorizontalFlex={Enum.UIFlexAlignment.SpaceBetween}
						SortOrder={Enum.SortOrder.LayoutOrder}
					/>
					<Swatch label="Stretch" order={1}>
						<imagelabel
							Name="Stretch"
							Size={UDim2.fromScale(1, 1)}
							Image={PANEL}
							BackgroundTransparency={1}
						/>
					</Swatch>
					<Swatch label="Slice (SliceCenter)" order={2}>
						<imagelabel
							Name="Slice"
							Size={UDim2.fromScale(1, 1)}
							Image={PANEL}
							ScaleType={Enum.ScaleType.Slice}
							SliceCenter={new Rect(new Vector2(8, 8), new Vector2(24, 24))}
							BackgroundTransparency={1}
						/>
					</Swatch>
					<Swatch label="Tile (TileSize)" order={3}>
						<imagelabel
							Name="Tile"
							Size={UDim2.fromScale(1, 1)}
							Image={CHECKER}
							ScaleType={Enum.ScaleType.Tile}
							TileSize={UDim2.fromOffset(16, 16)}
							BackgroundTransparency={1}
						/>
					</Swatch>
				</frame>

				<frame
					Name="Row2"
					LayoutOrder={3}
					Size={UDim2.new(1, 0, 0, 104)}
					BackgroundTransparency={1}
				>
					<uilistlayout
						FillDirection={Enum.FillDirection.Horizontal}
						HorizontalFlex={Enum.UIFlexAlignment.SpaceBetween}
						SortOrder={Enum.SortOrder.LayoutOrder}
					/>
					<Swatch label="Whole sheet" order={1}>
						<imagelabel
							Name="Sheet"
							Size={UDim2.fromScale(1, 1)}
							Image={SHEET}
							ScaleType={Enum.ScaleType.Fit}
							BackgroundTransparency={1}
						/>
					</Swatch>
					<Swatch label="ImageRect (3rd sprite)" order={2}>
						<imagelabel
							Name="Sprite"
							Size={UDim2.fromScale(1, 1)}
							Image={SHEET}
							ScaleType={Enum.ScaleType.Fit}
							ImageRectOffset={new Vector2(40, 0)}
							ImageRectSize={new Vector2(20, 50)}
							BackgroundTransparency={1}
						/>
					</Swatch>
					<Swatch label="ImageColor3 tint" order={3}>
						<imagelabel
							Name="Tinted"
							Size={UDim2.fromScale(1, 1)}
							Image={WHITE_PANEL}
							ScaleType={Enum.ScaleType.Slice}
							SliceCenter={new Rect(new Vector2(8, 8), new Vector2(24, 24))}
							ImageColor3={Color3.fromRGB(255, 150, 60)}
							BackgroundTransparency={1}
						/>
					</Swatch>
				</frame>
			</frame>
		</screengui>
	);
}

export const preview = {
	render: () => <ImageModesScene />,
	title: "Image modes",
} as const;
