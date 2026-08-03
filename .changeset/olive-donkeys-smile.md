---
"@loom-dev/react": patch
---

Resolve scale `UIPadding` when working out the width `TextWrapped` text wraps
at. An auto-sizing wrapped label under an ancestor whose padding is a scale —
`PaddingLeft={new UDim(0.15, 0)}` — was measured against a width that ignored
the inset entirely, so it came out with a box built for fewer lines than it was
then painted with. The overflow is clipped from both edges, which shows up as a
paragraph with its middle band visible and the rest cut away.

The layout engine has always resolved the scale (`padding_insets`): against the
node's own width where its X axis is a real one, and against zero where the axis
is automatic, since a scale inset on an automatic axis is circular — the width
sets the padding sets the width. The adapter read offsets only, which is the
right answer for the automatic case and wrong for the other. It now asks the
same question the engine does.

Only wrapped text was affected, and only under a scale inset: offset padding —
what a spacing helper emits — measured correctly before and is unchanged.

Also adds `wrap.test.ts`, which settles this feedback loop against the **real**
wasm layout rather than a stub, and checks the invariant directly: re-run the
adapter's own greedy wrap at the width the layout actually handed the label, and
the line count has to match the one the label's height encodes. It sweeps a
card-shaped tree across every stage width from 1200 down to 200, plus the shapes
where the two widths could come apart — a sibling on the same row, a
`UISizeConstraint`, a shrinking `UIFlexItem`, and the scale padding above.
