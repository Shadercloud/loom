---
"@loom-dev/layout": patch
"@loom-dev/scene": patch
"@loom-dev/renderer": patch
"@loom-dev/react": patch
---

Make `ScrollingFrame` scroll, and draw the bar that says so.

A scrolling list in Roblox is an `AutomaticSize` column inside an
`AutomaticCanvasSize` frame, and loom capped every child's automatic growth at
its parent's box — a rule that is right for a `45%` column and wrong for a
canvas, where outgrowing the window is the entire point. The column came out
exactly the window's height, so the canvas equalled the window, nothing ever
overflowed, and nothing ever scrolled. A `ScrollingFrame` now leaves its
children no ceiling on an axis whose canvas is free to grow (`AutomaticCanvasSize`,
or a `CanvasSize` of 0 on that axis); a `CanvasSize` that gives the axis a real
extent is still the ceiling it always was.

And loom drew no scroll bar at all, so a frame that did have something to scroll
looked like a static, clipped box. It now paints the engine's bar: a rounded
thumb in `ScrollBarImageColor3`, `ScrollBarThickness` px down the right edge (or
along the bottom), sized to the window's share of the canvas and draggable, over
the canvas rather than inset into it. Bars appear only on an axis with something
to scroll, and not at all under `ScrollingEnabled = false`, a zero thickness, or
a `ScrollingDirection` that rules the axis out.
