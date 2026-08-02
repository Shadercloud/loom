---
"@loom-dev/layout": patch
---

Settle a scale size against an unsized parent on its own content, the way the engine does.

`Size={UDim2.fromScale(1, 0)}` inside an auto-sizing parent is the library idiom for "as wide as whatever ends up holding me", and the pair is circular: the parent is waiting on this node's content, and this node is waiting on the parent. Loom resolved the scale against the parent's zero and collapsed the node — and everything under it — to nothing.

Measured in Studio, the engine settles the same chain on the content. A `fromScale(1, 0)` control inside an auto-sized row comes out the width of its own text. The numbers are now pinned as a test against Studio's: a padded 300 box holding an auto row, a fixed 150 label that does not grow, and a growing control whose child is `fromScale(1, 0)` gives `fieldset 240.5 / label 150 / control 84.5 / inner 84.5` in both.

The visible case was a `Select` inside a `Fieldset`: zero wide, with its value and caret spilling out of a box that had no size. A definite parent is unaffected — a scale size against a real width still resolves against that width.
