---
"loom-dev": patch
---

Make the Next.js gallery integration automatically respect the resolved Next
`basePath`, including GitHub Pages and other static exports hosted below a
subpath, while keeping the gallery output under its existing `public/` mount.

`withLoomGallery()` used one normalized `base` as three different things: the
Next rewrite route, the `public/` output directory, and the Vite base baked
into the generated gallery. Under a `basePath` those diverge — a site exported
to `https://…/rbxts-react-clean-ui/` served its gallery at
`/rbxts-react-clean-ui/loom-preview/` while every script, stylesheet, scene
chunk and runtime URL inside it still pointed at `/loom-preview/…` and 404'd.

The wrapper now derives two bases from the *resolved* config (after wrappers
like Fumadocs' `createMDX` have run):

- `mountBase` — the mount relative to the Next app (`/loom-preview/`). Rewrite
  rules keep using it, because Next prefixes `basePath` onto rewrite sources
  itself, and the static gallery still goes to `public/loom-preview`.
- `publicBase` — `basePath` + `mountBase`, used as the gallery's Vite base, so
  the generated HTML, chunks, dynamic imports and runtime URLs resolve where
  the browser actually loads them. The cross-process build marker keys on it,
  so builds with different effective bases can't share a stale marker.

The `base` option is unchanged and still means the mount relative to the app —
do not repeat the deployment prefix in it (loom now warns when it looks like
you did). A literal `<iframe src="/loom-preview/…">` in MDX is still yours to
prefix: it never passes through Next's router.
