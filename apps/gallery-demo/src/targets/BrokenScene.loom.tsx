// A target whose render throws on purpose: proves gallery error containment —
// selecting it must paint the inline red panel, and switching to another
// target afterwards must still work (the shell chrome is plain DOM).

function BrokenScene(): never {
	throw new Error(
		"BrokenScene threw on purpose — the gallery shell should contain this",
	);
}

export const preview = {
	render: () => <BrokenScene />,
	title: "Broken (throws)",
} as const;
