# loom-dev

## 0.3.0

### Minor Changes

- [`46bbb48`](https://github.com/astra-void/loom/commit/46bbb48622341ed55df0fc99f4e0f8f5addcb700) Thanks [@astra-void](https://github.com/astra-void)! - Make `loomPreview()` usable on its own: dropped into a `vite.config.ts` it now
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

### Patch Changes

- Updated dependencies [[`46bbb48`](https://github.com/astra-void/loom/commit/46bbb48622341ed55df0fc99f4e0f8f5addcb700)]:
  - @loom-dev/preview@0.3.0

## 0.2.1

### Patch Changes

- Updated dependencies [[`00ac09b`](https://github.com/astra-void/loom/commit/00ac09b2a85a6cbf7481c83a3a33d85880adf8ac)]:
  - @loom-dev/preview@0.2.1

## 0.2.0

### Minor Changes

- [`4c5eb6d`](https://github.com/astra-void/loom/commit/4c5eb6d17fa962c2c9841c2f4c509167c7e8c955) Thanks [@astra-void](https://github.com/astra-void)! - Add `loom-dev/embed`, a programmatic API for hosting the gallery inside another
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

### Patch Changes

- Updated dependencies [[`4c5eb6d`](https://github.com/astra-void/loom/commit/4c5eb6d17fa962c2c9841c2f4c509167c7e8c955)]:
  - @loom-dev/preview@0.2.0
