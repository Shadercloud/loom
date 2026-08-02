// UIPageLayout and UITableLayout: the two UIGridStyleLayouts loom used to
// recognise without implementing. The pager is driven the Roblox way — a ref and
// `JumpToIndex`/`Next`/`Previous`, since which page shows is state, not a prop.
import { useRef, useState } from "@rbxts/react";

const DARK = Color3.fromRGB(28, 32, 38);
const LINE = Color3.fromRGB(60, 64, 78);
const TEXT = Color3.fromRGB(235, 236, 240);
const MUTED = Color3.fromRGB(150, 156, 168);

const ROWS = [
	["Region", "Players", "Uptime"],
	["us-east", "12,480", "99.9%"],
	["eu-west", "8,210", "99.7%"],
	["ap-south", "5,036", "98.4%"],
];

function Cell(props: { text: string; head: boolean; order: number }) {
	return (
		<textlabel
			Name={props.text}
			LayoutOrder={props.order}
			Size={UDim2.new(0, props.head ? 120 : 100, 0, 26)}
			Text={props.text}
			TextColor3={props.head ? TEXT : MUTED}
			TextSize={14}
			TextXAlignment={Enum.TextXAlignment.Left}
			Font={props.head ? Enum.Font.GothamBold : Enum.Font.Gotham}
			BackgroundColor3={props.head ? LINE : DARK}
			BackgroundTransparency={props.head ? 0.4 : 1}
		/>
	);
}

function Page(props: { title: string; body: string; order: number }) {
	return (
		<frame
			Name={props.title}
			LayoutOrder={props.order}
			Size={UDim2.new(1, 0, 1, 0)}
			BackgroundColor3={Color3.fromRGB(38, 43, 51)}
		>
			<uicorner CornerRadius={UDim.new(0, 8)} />
			<uilistlayout
				FillDirection={Enum.FillDirection.Vertical}
				HorizontalAlignment={Enum.HorizontalAlignment.Center}
				VerticalAlignment={Enum.VerticalAlignment.Center}
				Padding={UDim.new(0, 6)}
				SortOrder={Enum.SortOrder.LayoutOrder}
			/>
			<textlabel
				Name="Title"
				LayoutOrder={1}
				Size={UDim2.new(1, 0, 0, 22)}
				Text={props.title}
				TextColor3={TEXT}
				TextSize={18}
				Font={Enum.Font.GothamBold}
				BackgroundTransparency={1}
			/>
			<textlabel
				Name="Body"
				LayoutOrder={2}
				Size={UDim2.new(1, 0, 0, 18)}
				Text={props.body}
				TextColor3={MUTED}
				TextSize={13}
				Font={Enum.Font.Gotham}
				BackgroundTransparency={1}
			/>
		</frame>
	);
}

/**
 * The slice of `UIPageLayout` this scene drives. A live instance carries every
 * Roblox property through an index signature, so its members type as `unknown`
 * until something says otherwise — in roblox-ts this would be the class type.
 */
interface Pager {
	Next(): void;
	Previous(): void;
	readonly CurrentPageIndex: number;
}

function PagerTableScene() {
	const pager = useRef<Pager | undefined>(undefined);
	const [page, setPage] = useState(0);
	const jump = (delta: number) => {
		const layout = pager.current;
		if (!layout) return;
		if (delta > 0) layout.Next();
		else layout.Previous();
		setPage(layout.CurrentPageIndex);
	};

	return (
		<screengui Name="PagerTableScene">
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
					Padding={UDim.new(0, 14)}
					SortOrder={Enum.SortOrder.LayoutOrder}
				/>

				<textlabel
					Name="TableHeading"
					LayoutOrder={1}
					Size={UDim2.new(1, 0, 0, 20)}
					Text="UITableLayout — columns take their widest cell"
					TextColor3={TEXT}
					TextSize={15}
					TextXAlignment={Enum.TextXAlignment.Left}
					Font={Enum.Font.GothamBold}
					BackgroundTransparency={1}
				/>
				<frame
					Name="Table"
					LayoutOrder={2}
					Size={UDim2.new(1, 0, 0, 122)}
					BackgroundTransparency={1}
				>
					<uitablelayout
						Padding={UDim2.new(0, 8, 0, 4)}
						FillEmptySpaceColumns={true}
						SortOrder={Enum.SortOrder.LayoutOrder}
					/>
					{ROWS.map((cells, row) => (
						<frame
							key={`row${row}`}
							Name={`Row${row}`}
							LayoutOrder={row}
							BackgroundTransparency={1}
						>
							{cells.map((text, column) => (
								<Cell key={text} text={text} head={row === 0} order={column} />
							))}
						</frame>
					))}
				</frame>

				<textlabel
					Name="PagerHeading"
					LayoutOrder={3}
					Size={UDim2.new(1, 0, 0, 20)}
					Text={`UIPageLayout — page ${page + 1} of 3`}
					TextColor3={TEXT}
					TextSize={15}
					TextXAlignment={Enum.TextXAlignment.Left}
					Font={Enum.Font.GothamBold}
					BackgroundTransparency={1}
				/>
				<frame
					Name="Pages"
					LayoutOrder={4}
					Size={UDim2.new(1, 0, 0, 90)}
					ClipsDescendants={true}
					BackgroundTransparency={1}
				>
					<uipagelayout
						ref={(instance) => {
							pager.current = instance as unknown as Pager;
						}}
						Padding={UDim.new(0, 16)}
						Circular={true}
						SortOrder={Enum.SortOrder.LayoutOrder}
					/>
					<Page order={0} title="One" body="pages sit a container apart" />
					<Page order={1} title="Two" body="ClipsDescendants shows just one" />
					<Page order={2} title="Three" body="Circular wraps at the ends" />
				</frame>

				<frame
					Name="Controls"
					LayoutOrder={5}
					Size={UDim2.new(1, 0, 0, 32)}
					BackgroundTransparency={1}
				>
					<uilistlayout
						FillDirection={Enum.FillDirection.Horizontal}
						HorizontalAlignment={Enum.HorizontalAlignment.Center}
						Padding={UDim.new(0, 10)}
						SortOrder={Enum.SortOrder.LayoutOrder}
					/>
					{[
						{ label: "◀ Previous", delta: -1 },
						{ label: "Next ▶", delta: 1 },
					].map((button) => (
						<textbutton
							key={button.label}
							Name={button.label}
							LayoutOrder={button.delta}
							Size={UDim2.new(0, 120, 1, 0)}
							Text={button.label}
							TextColor3={TEXT}
							TextSize={14}
							Font={Enum.Font.GothamBold}
							BackgroundColor3={Color3.fromRGB(70, 100, 220)}
							Event={{ Activated: () => jump(button.delta) }}
						>
							<uicorner CornerRadius={UDim.new(0, 8)} />
						</textbutton>
					))}
				</frame>
			</frame>
		</screengui>
	);
}

export const preview = {
	render: () => <PagerTableScene />,
	title: "Pager + table",
} as const;
