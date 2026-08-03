---
"@loom-dev/renderer": patch
---

Stop cutting the descenders off wrapped text. A paragraph's last line lost the
tails of its `y`, `p` and `g` — `activity` painting as `activitv` — and at a
large enough `TextSize` the first line lost the tops of its ascenders too
(reported in #11).

`TextSize` means different things to the two renderers, and the label's box is
sized in the engine's. Roblox fits the whole face into `TextSize`: one line of
it measures exactly `TextSize` tall and nothing pokes out. CSS spends it on the
em instead, and a face's own ascent + descent runs to ~1.2em on top of that. The
overlay was clipped to the box the layout computed — the engine's height,
`TextSize + (n - 1) * TextSize * LineHeight` — so the browser's taller line
boxes had nowhere to go, and the clip took the difference out of the glyphs.

The overlay's clip rect now carries that overhang, with padding handing the
content box its original height straight back: the text is placed exactly where
it was, `TextXAlignment`/`TextYAlignment` are untouched, and a label still clips
its own text at its left and right edges. Nothing about the layout moves —
`TextBounds`, `AbsoluteSize` and every rect around the label are the values they
were.

The room needed turns out to be the same at both edges, and the same whatever
`LineHeight` is set to and however many lines the text wraps onto: lines 2..n
sit on `TextSize * LineHeight` of pitch in either renderer and cancel, leaving
one face box against one `TextSize`, split evenly above and below. It is
measured per typeface and size, and re-measured when a face registered with
`registerFont` finishes loading and the metrics behind it change.

Also fixed: a label whose `LineHeight` was the only thing to change kept its old
line spacing, since the fingerprint that decides whether to repaint the overlay
did not read the property.
