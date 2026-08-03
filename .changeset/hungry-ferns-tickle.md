---
"@loom-dev/runtime": patch
"@loom-dev/react": patch
"@loom-dev/vide": patch
---

Read an enum property off a live instance whichever way it was written. The
engine takes the bare string wherever it takes the item — `AutomaticSize = "XY"`
*is* `Enum.AutomaticSize.XY`, and roblox-ts's own React typings offer both — and
`@loom-dev/scene` has always encoded either. The adapters did not: every place
they read one back off an instance insisted on an `EnumItem` and treated a
string as absent.

So a label written `AutomaticSize="XY"` was auto-sized by the layout, which took
the string happily, and measured by nobody: no `TextBounds` was emitted for it,
so it collapsed to zero and its text spilled out of a box with no height. The
same blind spot ran through the wrap machinery — the ancestor walk that finds
the width `TextWrapped` wraps at could not tell such a frame was automatic, so
it stopped there and wrapped against a width that frame had been given *by the
label*, which is a circle that leaves text frozen at whatever width it first
got; and the staleness check skipped the label, so nothing re-measured it.
`FontSize` written as a string was ignored the same way, falling back to 14.

`enumName` in `@loom-dev/runtime` is now the one reader for all of it, and both
adapters go through it.

The regression test drives it through the real layout engine across forty-one
stage widths: before, the label measured `0` wide at every one of them.
