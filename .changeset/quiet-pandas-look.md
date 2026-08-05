---
"@loom-dev/preview": minor
---

Add a debug mode to the gallery: `?debug=1`, the sidebar's `debug` button, or
Ctrl+Alt+D.

The panel reports what a preview is actually doing — the mounted target with
its import and first-frame timings; the logical viewport the scene laid out
against beside the stage, the camera and the mobile scale factor; the live tree
by instance, GuiObject, hidden, depth and class, with each layer's
`DisplayOrder`; every typeface the text resolved to and whether the browser
really loaded it or quietly fell back to another face's metrics; the frame rate
and the DOM patches behind it; and a count of what loom logged to a console
nobody reads.

Hovering the stage names the GuiObject under the pointer, outlines it with its
size, and lists its ancestry, geometry, `UI*` modifiers, resolved typeface and
properties. Alt+click pins the selection, and the ancestry trail and the rest of
the hit stack are clickable, so the tree can be walked from the panel. The hit
test is the scene's own `PlayerGui:GetGuiObjectsAtPosition`, so a click-through
frame that no browser inspector can reach is still inspectable.

`copy` puts the readout on the clipboard; `json` downloads it as data — every
section plus the whole instance tree with absolute geometry — and the same
snapshot is available as `loomDebug.snapshot()` while the panel is open, for a
devtools session or a headless harness.

Everything is read-only and outside the render path, and while the panel is
closed — the state every non-debugging preview is in — none of it runs: no
observers, no timers, no tree walks. The toggle is remembered for the tab so an
HMR reload doesn't close it, except in a `chrome=none` embed, where a debug
panel only ever appears if the URL asked for one.
