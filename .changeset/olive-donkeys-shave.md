---
"@loom-dev/preview": patch
---

Stop the embedded gallery flashing its dark backdrop before `?theme=` / `?background=` takes effect.

The generated page painted `#14161a` from its inline `<style>` no matter what the URL asked for, and the requested backdrop only arrived once the bundle, the WASM layout engine and the target chunk had loaded — half a second of black on a light or custom-coloured embed, repeated every time a host control changed a param and reloaded the iframe.

The backdrop is now decided in the page's `<head>`, from `location.search` alone, before the first paint: a small inline script applies the theme class and the `?background=` colour, and the stylesheet that used to carry the colour no longer paints one at all (so nothing repaints over the decision). The shell's own theme and `{type:"loom-background"}` handling is unchanged and writes to the same element, which makes its first pass a no-op rather than a second paint.

The inline script shares its colour patterns with `parseBackgroundColor`, so the early paint and the shell can't drift; a test pins the two readings together over one table of inputs.
