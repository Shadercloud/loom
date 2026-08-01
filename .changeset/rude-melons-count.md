---
"@loom-dev/preview": patch
"@loom-dev/renderer": patch
---

Make previews usable on a phone.

- **The stage keeps a desktop viewport instead of overflowing.** Below 960px wide the preview mount lays out at 960 logical pixels and is scaled down with a CSS transform to fit the real screen, so a UI written for a desktop viewport shrinks rather than running off the edge. The logical height follows the real aspect ratio (no letterboxing), and at 960px or wider nothing is applied at all — desktop previews are unchanged. The generated pages use `dvh`, so a full-height stage no longer hangs under the mobile browser toolbars.
- **Pointer coordinates follow the scale.** The renderer converts on-screen pixels back into layout pixels (`MouseEnter`/`Activated`/`InputChanged` positions, `GetMouseLocation`, wheel deltas) by reading the mount's own rendered-to-layout ratio, so hit testing lands where the scene looks like it is.
- **ScrollingFrames scroll from a touch drag.** There is no wheel on a phone; a drag now moves `CanvasPosition` with the same clamping the wheel uses, and past a small slop it stops counting as a tap so the control under the finger is not activated. Only ScrollingFrames opt out of native touch panning — a preview embedded in a docs page never traps the reader — and taps no longer wait for the browser's double-tap-zoom timeout.
- **The gallery chrome stacks on a narrow screen.** The 248px sidebar becomes a top bar with a `targets` button that opens the list and closes it again on selection, leaving the rest of the screen to the stage. `?chrome=none` (the docs-site iframes) is unaffected.
