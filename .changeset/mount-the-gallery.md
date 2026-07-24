---
"loom-dev": minor
"@loom-dev/preview": minor
---

Add `loom-dev/embed`, a programmatic API for hosting the gallery inside another
toolchain: `createGalleryServer()` returns a middleware-mode Vite server that a
host dev server can mount under a public base, and `buildGallery()` runs the
static build into a host-chosen output directory. `findGalleryTargets()`,
`isGalleryRequest()` and `normalizeGalleryBase()` round out the surface for
hosts that need to route or skip cleanly. Middleware mode always puts HMR on a
standalone port, so the gallery picks a free one instead of colliding on Vite's
default 24678; `hmrPort` pins it or turns HMR off.

Both the gallery index HTML and the injected Roblox-globals script are now
base-aware, so a gallery mounted at e.g. `/loom-preview/` serves and boots
correctly instead of requesting its entry from the host's root.
