---
"loom-dev": minor
---

Add `loom-dev/next` — a Next.js integration for the loom gallery with the same one-line setup the Astro embed gets. `withLoomGallery(nextConfig, { root, targets })` returns a phase-aware function config: `next dev` proxies `/loom-preview/*` to an isolated, lazily-booted gallery Vite server (full HMR, host React untouched, webpack and Turbopack alike), `next build` emits the static gallery into `public/<base>` automatically (`staticBuild: false` to opt out), and `next start` serves it with the bare mount path mapped onto its `index.html`. Also exports `startGalleryServer`, a standalone HTTP wrapper around the embed middleware for hosts that can only forward to a URL.
