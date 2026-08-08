---
"@loom-dev/preview": patch
---

Give the asset prerender loom's own React, so a static build with `assets` on
does not die in an installed app.

`next build` failed with `[loom:asset-bundle] Cannot read properties of undefined
(reading 'ReactCurrentBatchConfig')` as soon as a gallery composed an
`rbxassetid://` at runtime, and the only way out was `assets: false`. The bake
mounts the scenes to find those ids, and it hands the CommonJS reconciler to
node, where Vite's aliases do not apply: node answered the reconciler's own
`require("react")` with whatever sat beside it. In a published install that is
the host app's React 19 — npm hoists `@loom-dev/react` next to it while loom's
React 18 stays nested under `loom-dev` — and reconciler 0.29 dies reading React
18's since-renamed internals before a single scene mounts.

Node's resolver is now pinned for the length of the prerender, and only for
requires coming from inside the reconciler: it gets loom's React 18, and a host
framework building its own React 19 pages in the same process is untouched.

A prerender that cannot start no longer fails the build either. That was always
the promise for a scene that will not render; it now covers the pass itself, so
the worst case is a warning and the ids the bundle scan could read, not a lost
build.
