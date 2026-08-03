---
"@loom-dev/renderer": patch
---

Draw text at the size the engine draws it. `TextSize` is not a font size:
Roblox fits the *whole face* into it — ascender to descender, which is why a
one-line label measures exactly `TextSize` tall — while CSS `font-size` sets the
em square, and a face's ascent + descent runs well past 1em. Painting
`font-size: TextSize` therefore drew every glyph too big by that font's own
ratio: 17% for Roboto, 18% for Jura, 25% for Merriweather, 47% for Oswald.

Everything downstream inherited it. Text measured that much wider than the
engine's, so it wrapped that much earlier, so `AutomaticSize` boxes came out
taller and wider, and a card sized to its text overran the column that was
meant to hold it — all of it looking like a wrap bug, none of it being one.

Measured against Studio (`TextService:GetTextBoundsAsync`, Roboto, `TextSize`
18): `Player Profile` 93 units in the engine and 105 here, the whole body
string 797 against 910. The paragraph from #11 laid out at eleven widths, in
lines:

| width | engine | before | after |
| ---: | ---: | ---: | ---: |
| 300 | 29 | 33 | 27 |
| 400 | 21 | 24 | 20 |
| 500 | 17 | 19 | **17** |
| 586 | 14 | 17 | **14** |
| 700 | 12 | 14 | **12** |
| 800 | 10 | 12 | **10** |
| 900 | 9 | 11 | **9** |
| 1000 | 9 | 10 | 8 |
| 1099 | 8 | 9 | **8** |
| 1200 | 7 | 8 | **7** |

Wrong at every width before; matching at eight of ten now. The rest is the
engine rendering ~3% wider than its own metrics at small sizes, where it
advances glyphs in whole pixels and a browser does not — loom now sits a hair
narrow rather than a seventh wide.

The ratio is read off the face the browser will actually paint with, so it
follows a registered typeface, and is re-read when one finishes loading. A
browser that reports no `fontBoundingBox*` metrics keeps the old 1:1 mapping
rather than guessing. `LineHeight` now sets the line box in pixels off
`TextSize`, since the pitch the engine spends is `TextSize`-relative and no
longer follows the font size; `<font size="…">` in `RichText` converts through
the metrics of the face that run lands in.
