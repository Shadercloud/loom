# @loom-dev/preview

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
