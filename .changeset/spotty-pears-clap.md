---
"@loom-dev/preview": patch
---

Let a preview reflow at every viewport, and make the zoom `?base=` only.

A stage narrower than 960px on a coarse-pointer device used to keep a
desktop-sized logical viewport and paint the whole scene scaled down. That
looked like the same layout drawn smaller, but it was a *different* layout from
the one the engine gives at that viewport: `TextWrapped` text kept the line
breaks it had at 960, a `UIListLayout` with `Wraps` kept its row count,
`AutomaticSize` settled at the wide measurement, and scale-vs-offset mixes
re-proportioned against the wrong number — wrong in exactly the places a narrow
viewport is the thing being checked.

Now the scene lays out against the stage's real pixels everywhere, so a phone
reflows the way a phone-sized Roblox viewport reflows. The zoom is still there
for a page that wants a wide composition inside a narrow column, but it has to
be asked for: `?base=<px>` (or a bare `?base` for 960). `?base=none`/`off`/`0`
spells the default out for a host page templating the param.
