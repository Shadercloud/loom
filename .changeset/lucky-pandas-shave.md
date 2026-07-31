---
"@loom-dev/preview": patch
"loom-dev": patch
---

Add zero-config Loom compatibility for the root `@rbxts/ui-labs` `Environment`
import while preserving user-provided shim overrides.

The package ships a Luau runtime plus `.d.ts` and nothing a browser can run, so
importing it used to fail outright. Loom now aliases the root specifier — and
only the root specifier — to a built-in module modelling the **non-story** UI
Labs environment: `IsStory()` is `false`, `InputListener` is `undefined`, and
`UserInput` is loom's own `UserInputService` singleton, so the common
`Environment.IsStory() ? Environment.InputListener : UserInputService` guard
selects loom's service with no configuration. Story creators, controls,
snapshots and the Studio plugin APIs are not emulated.

A `shims` entry for the same specifier still wins, and a Luau-only package with
no shim now fails with a loom diagnostic naming the package and the `shims`
option instead of handing Luau to the JavaScript parser.
