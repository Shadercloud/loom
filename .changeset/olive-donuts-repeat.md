---
"@loom-dev/renderer": patch
---

Paint the string the engine paints. A newline in `Text` breaks the line in
Roblox — wrapped or not, `RichText` or not, exactly as `<br/>` does — and a run
of spaces stays a run of spaces. Loom measured it that way (every measurer here
splits on `\n`) but painted through HTML's defaults, `white-space: normal` and
`nowrap`, which fold both away. So a label written with line breaks in it
measured as, say, twenty-three lines and painted as seventeen: a box a hundred
pixels taller than the text inside it, and every sibling below pushed down by
room nothing occupies.

It is now `pre-wrap` when the label wraps and `pre` when it does not, so the
paint has the line breaks the measurement counted. Text with no newlines and no
double spaces — most text — is unaffected.
