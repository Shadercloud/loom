# loom-dev

## 0.5.0

### Minor Changes

- Support the modern Roblox UI surface: `FontFace`, flex layout, and tweens

  Four things a roblox-ts UI written today reaches for, which previews used to
  either ignore or die on:

  - **`FontFace` and the `Font` datatype.** `new Font(family, weight, style)` is a
    global, `Enum.FontWeight` / `Enum.FontStyle` exist, and the renderer resolves
    `FontFace` (preferred) or the legacy `Font` enum into a CSS family/weight/slant
    — including for `AutomaticSize` text measurement. `Font` is a new Scene IR
    property value, and `<textlabel FontFace={…} />` typechecks.
  - **`UIListLayout` flex and `UIFlexItem`.** `HorizontalFlex` / `VerticalFlex`
    spread leftover space along the fill axis (`SpaceBetween`, `SpaceAround`,
    `SpaceEvenly`, `Fill`) and stretch children across the cross axis (`Fill`);
    `UIFlexItem.FlexMode` grows an individual child (`Grow`/`Fill`, or `Custom`
    with `GrowRatio`).
  - **`TweenService`.** `Create`/`Play`/`Pause`/`Cancel`, `Completed`,
    `PlaybackState`, `GetValue`, every `EasingStyle`/`EasingDirection`, plus
    `DelayTime`, `RepeatCount` and `Reverses`. Tweens interpolate numbers,
    `Color3`, `UDim`, `UDim2` and `Vector2` on the scheduler's frame signal, so
    tweened writes flush like any other property write. Exported from
    `@loom-dev/preview/services`, so `import { TweenService } from "@rbxts/services"`
    resolves.
  - **`new ColorSequence(c0, c1)`.** The constructor now takes every form
    `ColorSequence.new` does. roblox-ts compiles the two-color factory call to the
    constructor, so a gradient built that way used to throw while the frame was
    being encoded.

### Patch Changes

- Fix gallery shell and target module loading on Windows by generating valid
  Vite `/@fs/` URLs, and make Next.js gallery roots resolve eagerly from the app
  directory.
- Updated dependencies []:
  - @loom-dev/preview@0.5.0

## 0.4.0

### Minor Changes

- [`0a883fe`](https://github.com/astra-void/loom/commit/0a883feb2f22fe9bcd04cd73faf8dff2b2fcd556) Thanks [@astra-void](https://github.com/astra-void)! - Add `loom-dev/next` — a Next.js integration for the loom gallery with the same one-line setup the Astro embed gets. `withLoomGallery(nextConfig, { root, targets })` returns a phase-aware function config: `next dev` proxies `/loom-preview/*` to an isolated, lazily-booted gallery Vite server (full HMR, host React untouched, webpack and Turbopack alike), `next build` emits the static gallery into `public/<base>` automatically (`staticBuild: false` to opt out), and `next start` serves it with the bare mount path mapped onto its `index.html`. Also exports `startGalleryServer`, a standalone HTTP wrapper around the embed middleware for hosts that can only forward to a URL.

### Patch Changes

- Updated dependencies [[`12c6c8e`](https://github.com/astra-void/loom/commit/12c6c8e59e6b7276e0c9245470746a1a9121fe39)]:
  - @loom-dev/preview@0.4.0

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
