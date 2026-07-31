---
"@loom-dev/preview": patch
"@loom-dev/react": patch
"@loom-dev/runtime": patch
"loom-dev": patch
---

Replace the hand-written `@rbxts/react` shim with an audited browser
compatibility facade, so a roblox-ts React project imports into Loom unchanged.

`import React, { Component, ReactComponent } from "@rbxts/react"` previously
failed the production build with `RollupError: "ReactComponent" is not exported
by …/react-shim.js`. The shim listed the names Loom's own demos used; the
replacement (`@loom-dev/preview/src/compat/react.ts`) forwards the complete
runtime surface of the supported `@rbxts/react` (17.3.7-ts.2):

- **Standard React by identity.** `Component`, `createElement`, every hook and
  the rest come from the one pinned React the reconciler renders with —
  `Component === (await import("react")).Component` — so there is still exactly
  one React, one hook dispatcher, and no wrappers.
- **`ReactComponent` / `ReactPureComponent`** as identity decorators, preserving
  constructor identity, statics, `displayName` and the prototype chain, under
  both `experimentalDecorators` and TC39 decorators.
- **`Event`, `Change` and `Tag`** as runtime values as well as props. `Tag` now
  writes to a real `CollectionService` in `@loom-dev/runtime` (`AddTag`,
  `HasTag`, `GetTagged`, the added/removed signals) and is retracted on unmount.
- **`None`** is importable and throws a Loom-specific error when used, rather
  than silently settling into class state that browser React cannot delete from.
- **`@rbxts/react-roblox`** covers everything upstream declares —
  `createBlockingRoot`, `createLegacyRoot`, `act` and `version` alongside
  `createRoot` and `createPortal` — and its alias is now exact, so an unadapted
  subpath of either package raises a named Loom diagnostic listing the supported
  entrypoints instead of resolving to the wrong module or dying inside Rollup.

A contract test derives the expected surface from upstream's own `index.d.ts`
via the TypeScript compiler API, and real Vite/Rollup builds (plus a packed
tarball install into an external Next.js app) cover the export-analysis failure
the unit tests could not see.
