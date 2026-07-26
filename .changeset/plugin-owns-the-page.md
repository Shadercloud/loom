---
"@loom-dev/preview": minor
"loom-dev": minor
---

Make `loomPreview()` usable on its own: dropped into a `vite.config.ts` it now
serves the whole preview, with no `index.html` and no other setup.

- The plugin **generates the page**. Under `serve` a middleware answers `/` with
  a document carrying `#loom-root` and a module script for the detected client
  entry (`src/main.client.tsx` and friends); under `build` the same document is
  a virtual `<root>/index.html` wired up as the Rollup input, so `vite build`
  emits a static site from a project that has no HTML file at all. A project
  with its own `index.html` keeps it.
- **Gallery mode is a plugin option**: `loomPreview({ targets })` serves the
  `*.loom.tsx` sidebar shell in dev and emits the same static, deep-linkable
  gallery under `vite build` that `loom build` does. `entry`, `title` and
  `html: false` round out the options.
- Under `build` the Roblox globals are now part of the module graph — the html's
  entry modules get the globals import prepended, so `installGlobals()` runs
  first. A `vite build` with the plugin previously produced a bundle with no
  globals at all unless the CLI generated the entry.
- Target discovery, codegen and the gallery shell moved from the CLI package to
  `@loom-dev/preview` (new `@loom-dev/preview/gallery` entry point) — the CLI is
  now a thin wrapper over the plugin, and `loom build` drops its scratch-dir
  codegen for the plugin's own build path.
