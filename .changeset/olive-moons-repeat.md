---
"@loom-dev/renderer": patch
---

Size the bundled faces the way the engine sizes them, and spend kerning.

`TextSize` is the height of the whole face, so loom divides by the face's own
box to get a `font-size`. It read that box from the browser
(`fontBoundingBoxAscent + Descent`), and that is not the number Roblox divides
by: Roboto reports 1.17 there while the engine sizes it as though it were 1.14.
Every Roboto glyph was painted about 2.6% small, and since advances come off the
same size, every string measured that much narrow before half-pixel rounding
pushed it back out.

`ENGINE_FACE_BOX` now carries the engine's ratio for each family
`@loom-dev/renderer/fonts` registers, solved against
`TextService:GetTextBoundsAsync` per-glyph advances at `TextSize` 18. 24 of the
28 reproduce all 24 sampled glyphs exactly; `FredokaOne` (Fredoka stands in for
it), `Merriweather`, `Nunito`, `Oswald` and `DenkOne` do not, and their fitted
ratio is still closer than the browser's. A family with no entry — anything a
project registered itself, `Gotham` included — keeps the measured box.

With the glyphs at the right size, advances round to the half pixel instead of
snapping up, which was only ever compensating for their being small. The engine
also kerns (`AV` is 19.5 where its glyphs are 10.5 and 10 alone), so
`shapedTextWidth` now adds the run's kerning, quantized once for the run.

Against the engine, Roboto 18, the [#11](https://github.com/astra-void/loom/issues/11)
paragraph: string widths are exact on 6 of 10 and never off by more than 0.5
(they were off by up to 9), and the wrapped line count matches at 49 of 50
widths from 320 to 1300 — 45 before this, 34 when CSS did the wrapping.
