---
"@loom-dev/layout": patch
---

Stop a parent with no width on an axis from collapsing everything inside it.

0.6.4 bounded `AutomaticSize` by the room its parent leaves, which is what keeps a `45%` card from overrunning the column beside it. It took that too literally: a parent measuring 0 on an axis was handed down as a ceiling of 0, so every auto-sized descendant was pinned to nothing.

A box with nothing on an axis is not a statement that everything inside it is zero. `Size={fromScale(1, 0)} AutomaticSize={Y}` — "as wide as my parent, as tall as my content" — is the library idiom for a control that has no width of its own yet, and a popover positioned from a ref is 0 wide on the render before the ref resolves. The engine lets content overflow such a box rather than collapsing it. A `Select` lost its value label and its caret to this; anything nested under a width-less container would have.

Zero is now read as "no ceiling", which is how the rest of the engine already reads it — `UIGridLayout` treats a `line_len <= 0` fill axis as unconstrained, and a zero `CanvasSize` is ignored in favour of the window. A ceiling that is genuinely positive still applies, so the overrun 0.6.4 fixed stays fixed.
