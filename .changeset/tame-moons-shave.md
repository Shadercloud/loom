---
"@loom-dev/renderer": patch
---

Stop sizing text by a face the browser never loaded.

`ENGINE_FACE_BOX` carries the ratio the engine sizes each bundled family by, and
it was reached purely by *name*: a family with a registration got its entry, and
a registration is only a claim about a file the page still has to fetch. When
that fetch fails, the browser paints the fallback while loom goes on sizing the
text as though Source Sans 3 were there — every advance comes off the wrong
glyphs, so `wrapLines` breaks in places the engine does not and `AutomaticSize`
reports a box that does not fit the text drawn in it.

Only a dev server can land there. A static build carries its font files in its
own output, so the face is always present and the calibration always right,
which is what made this read as a dev-only rendering bug rather than a font that
failed to load. Measured against the same gallery target at one width, a dev
server whose face 404s wrapped the issue's paragraph to ten lines where the
build of the same source took nine.

The calibration now applies only when the browser can actually paint the family,
and falls back to measuring the face it really has — which is self-correcting,
since a font-loading cycle drops the metric caches and the label re-measures
against the face that just landed. And the missing-face audit no longer skips a
family because it has a registration: a registered face that never arrived is
now reported instead of quietly mis-measured.

`familyIsAvailable` is exported for hosts that register their own faces and want
the same answer.

Refs: #11
