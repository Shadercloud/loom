---
"@loom-dev/layout": patch
---

Stop a `Wraps` list breaking every item onto its own line when it has no room to wrap against.

A fill axis with nothing on it is unconstrained, not a zero-wide box every item overflows. `UIGridLayout` has always read it that way — a `line_len <= 0` fill axis is one row, no wrap — and 0.6.5 gave `AutomaticSize` the same reading. `UIListLayout`'s `Wraps` was still measuring against the zero, so every item took a line of its own.

It shows up wherever a control is laid out before it has been given a width: a `Select` inside a `Fieldset` put its caret on the line below its own value, and the button around them came out twice as tall as it should be. Any `HStack` inside a container sized `{fromScale(1, 0)} AutomaticSize={Y}` had the same shape.
