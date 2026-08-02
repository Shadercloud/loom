---
"@loom-dev/scene": patch
"@loom-dev/layout": patch
---

Read an enum property written as a plain string, the way the engine does.

Roblox coerces a bare string on an enum property — `FlexMode = "Custom"` is `Enum.UIFlexMode.Custom` — and roblox-ts types the props that way, so component libraries pass strings straight through: `valign="Center"`, `align="Right"`, `mode="Custom"`. Loom read only the `EnumItem` form, so every one of those was a silent no-op, with nothing logged and nothing to point at.

The visible one was flex. A `UIFlexItem` whose `FlexMode` came through as a string took no weight at all, so the row's grower never grew: a `Fieldset`'s control — a `Select` — was laid out at zero width, with its value and caret spilling out of a box with no size. Alignment properties written the same way were being ignored too.

Both readers now take either spelling, since both only ever ask for the item's name.
