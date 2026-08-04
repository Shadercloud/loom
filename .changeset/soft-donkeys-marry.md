---
"@loom-dev/renderer": patch
---

Paint wrapped text at the line breaks it was measured with.

A label's box came from `shapedTextWidth` — one advance per grapheme, snapped to
the half pixel, the way the engine spends them — while the glyphs inside it were
left to CSS, which wraps on its own kerned run widths. Those are a couple of
percent narrower, so a label could reserve nine lines and paint eight, ending
short of a box built for it, and break at different words than Studio does.

`wrapLines` is now the single place a wrap is decided: measurement asks it how
many lines a label needs, and the text layer asks it where to put the breaks it
paints, keeping them in `white-space: pre`. `RichText` runs go through the same
wrap with the line carried across runs, each measured in the font its `<font>`
tag gave it.

Checked against `TextService:GetTextBoundsAsync` (Roboto 18, the paragraph from
[#11](https://github.com/astra-void/loom/issues/11), 50 widths from 320 to
1300): the painted line count matches the engine 45 times, against 34 when CSS
did the wrapping. What is left over is the measurement running about a percent
roomy, so text wraps a hair early rather than overflowing its box.
