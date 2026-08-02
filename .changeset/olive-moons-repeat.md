---
"loom-dev": patch
---

Let a host actually turn the `rbxassetid://` bake off. `assets: false` shipped on
the Vite plugin in `0.7.0`, but every wrapper around it — `loom build`,
`buildGallery`, `withLoomGallery` — dropped the option on the floor, so the one
place a build most needs to stay off the network (a docs site's embedded
gallery) had no way to say so. All three forward it now, and `loom build` takes
`--no-assets`.
