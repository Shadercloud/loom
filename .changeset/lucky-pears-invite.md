---
"@loom-dev/renderer": patch
"@loom-dev/react": patch
---

Round each `UICorner` corner on its own, and draw a `UIStroke` on the side of the edge it asks for.

- **`TopLeftRadius` … `BottomRightRadius` are applied**, each overriding `CornerRadius` for its own corner. That is how a card rounds only its top while its footer rounds only its bottom — a shape that came out square before, since only `CornerRadius` was read. Everything drawn from the same box follows: the `UIStroke` ring and the `UIShadow` are box-shadows, so they take the new radius for free. A radius that returns to zero now squares the box off again instead of keeping the last rounding it had. Thanks to [@Shadercloud](https://github.com/Shadercloud) for the report and the first cut in [#10](https://github.com/astra-void/loom/pull/10).
- **`UIStroke.BorderStrokePosition`**: `Outer` (the default, and what was always drawn) spreads outward, `Inner` insets so the stroke eats into the object instead of inflating it — a bordered header stays flush with the card around it rather than overhanging it — and `Center` straddles the edge with half the thickness each way.
- **`UIStroke.Enabled = false` and a fully transparent stroke paint nothing**, matching what `UIShadow` already did, and a stroke that is switched off takes its ring with it instead of leaving it on the element.
