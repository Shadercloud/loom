# @loom-dev/preview

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
  - @loom-dev/runtime@0.5.0
  - @loom-dev/react@0.5.0

## 0.4.0

### Patch Changes

- [`12c6c8e`](https://github.com/astra-void/loom/commit/12c6c8e59e6b7276e0c9245470746a1a9121fe39) Thanks [@astra-void](https://github.com/astra-void)! - Narrow the `react` peer range to `^18.3.1`.

  The declared range allowed `^19.0.0`, but the React adapter drives
  `react-reconciler@^0.29.2`, which reads React 18 internals that React 19
  renamed — a React 19 install fails at evaluation time with an
  `Invalid hook call` / duplicate-React error. The range now matches what the
  reconciler actually supports, so the failure surfaces at install time instead
  of at first render.

- Updated dependencies []:
  - @loom-dev/runtime@0.4.0
  - @loom-dev/react@0.4.0

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

- Updated dependencies []:
  - @loom-dev/runtime@0.3.0
  - @loom-dev/react@0.3.0

## 0.2.1

### Patch Changes

- [`00ac09b`](https://github.com/astra-void/loom/commit/00ac09b2a85a6cbf7481c83a3a33d85880adf8ac) Thanks [@astra-void](https://github.com/astra-void)! - Fix the preview plugin against an **installed** loom (as opposed to a workspace
  checkout), which never worked: a project depending on the published packages got
  a blank preview and `does not provide an export named 'DefaultEventPriority'`.

  Everything that failed traces back to one thing — Vite resolves
  `optimizeDeps.include` entries, and anything an optimized chunk imports, from
  the _previewed project's_ root, which has no `@loom-dev` packages at all:

  - `@loom-dev/react` is now pre-bundled (aliased to an absolute path so the
    optimizer can find it), which folds in its CJS `react-reconciler`. Excluded
    from optimization, its raw ESM imported raw CJS and died at evaluation. The
    other loom packages stay excluded, so they remain external to that chunk and
    keep their single instance.
  - The loom packages that chunk imports are aliased to absolute paths too;
    otherwise they resolve to nothing from `node_modules/.vite/deps`.
  - `server.fs.allow` now covers the `node_modules` that holds them, so
    `@loom-dev/layout` can serve its wasm binary out of its own `pkg/` instead of
    answering 403 (`TypeError: HTTP status code is not ok`).

  All of it is gated on the adapter resolving inside `node_modules`: a workspace
  checkout keeps resolving through its own link chain, unbundled and hot-reloading
  as before.

- Updated dependencies []:
  - @loom-dev/runtime@0.2.1
  - @loom-dev/react@0.2.1

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

- Updated dependencies []:
  - @loom-dev/runtime@0.2.0
  - @loom-dev/react@0.2.0
