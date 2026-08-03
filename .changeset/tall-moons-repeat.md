---
"@loom-dev/renderer": patch
---

Re-measure text when a face finishes loading, not only when the first font
loading cycle ends. A registered face is never loaded at the moment it is
registered — nothing has asked the browser for it, and the canvas loom measures
with never will, since `measureText` paints nothing and so starts no download.
The face only loads when the text first paints in it, and until loom hears about
that, every `AutomaticSize` bound and every `TextWrapped` line count standing on
screen belongs to the fallback the browser used instead.

Loom heard about it through `document.fonts.ready`, which is one promise for the
cycle in flight when it is read. Read while the document is still loading it
resolves after the faces land — so a static build, where one bundle and one
stylesheet register everything before the document is done, came out right. Read
a moment later, with the document settled and no face asked for yet, it is
*already resolved*: the listeners fired at once against the fallback, and the
face that downloaded seconds afterwards notified nobody. The layout stayed
measured for a typeface that is no longer the one being painted — text wrapped
at the wrong width, in a box built for the wrong number of lines — until
something unrelated, a resize, forced it to be measured again.

A dev server puts loom on exactly that side of the line: the app boots through a
graph of separate module requests, long after the document finished. That is why
the same scene at the same version could render correctly deployed and wrongly
under `npm run dev` — and why it was worst where the fallback's metrics are
furthest from the registered face, which on Windows (Segoe UI standing in for
Roboto or Source Sans 3) is a great deal further than on macOS. A target
switched in the gallery, or any scene loaded lazily, is on that side whatever
the build.

Loom now listens for `loadingdone` on `document.fonts`, which fires at the end
of *every* cycle and so has no such window. The missing-face warning waits the
same way, instead of naming a family whose download had only just begun.
