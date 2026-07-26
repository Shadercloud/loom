---
"@loom-dev/preview": patch
---

Narrow the `react` peer range to `^18.3.1`.

The declared range allowed `^19.0.0`, but the React adapter drives
`react-reconciler@^0.29.2`, which reads React 18 internals that React 19
renamed — a React 19 install fails at evaluation time with an
`Invalid hook call` / duplicate-React error. The range now matches what the
reconciler actually supports, so the failure surfaces at install time instead
of at first render.
