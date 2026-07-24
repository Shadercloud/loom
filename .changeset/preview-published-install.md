---
"@loom-dev/preview": patch
---

Fix the preview plugin against an **installed** loom (as opposed to a workspace
checkout), which never worked: a project depending on the published packages got
a blank preview and `does not provide an export named 'DefaultEventPriority'`.

Everything that failed traces back to one thing — Vite resolves
`optimizeDeps.include` entries, and anything an optimized chunk imports, from
the *previewed project's* root, which has no `@loom-dev` packages at all:

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
