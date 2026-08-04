---
"@loom-dev/preview": patch
---

Bake the `rbxassetid://` images a static build only builds at runtime.

The bake read the emitted bundle for `rbxassetid://<digits>`, which finds an id a
source spells out and nothing else. A component library composes them —
`` `rbxassetid://${iconId}` `` over a table of ids — and after bundling that is a
prefix, a `+`, and a few hundred bare numbers no scan can tell from any other
number. So the manifest came out empty and a gallery built from a real UI library
painted none of its icons, while `loom preview` showed them all.

The build now *runs* the scenes to find out. Every gallery target is mounted in
node — happy-dom for the DOM, the real react adapter and runtime, a stub layout
in place of the WASM engine — and the live instance tree is read for its `Image`
properties. That answers with what the page will ask for however the string was
built, and only that: a 700-icon set contributes the dozen icons the scenes
actually render.

The pass runs only when the output composes an id (a build whose ids are all
spelled out is unchanged, and pays nothing), and never fails a build — a target
that will not import or render is warned about and skipped, and composition that
prerendering could not resolve says so rather than leaving a blank image
unexplained. Still out of reach: an image the first render never reaches, behind
a hover state or a later fetch.
