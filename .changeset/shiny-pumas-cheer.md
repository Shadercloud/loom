---
"@loom-dev/preview": patch
"loom-dev": patch
---

Add a `shims` option for roblox-ts packages loom can't run in the browser.

A declaration-only Luau package (`"main": "src/init.lua"` plus a `.d.ts`, no
`src/index.ts`) has no source entry the `.luau`-main fallback can redirect to,
so importing one fails with `Failed to resolve entry for package`.
`shims: { "<specifier>": "<module>" }` redirects the package to a browser module
the project supplies — exact-match only, applied before loom's own `@rbxts/*`
aliases, and available on every entry path (`loomPreview()`, `loom.config.ts`,
`loom-dev/embed`, `withLoomGallery()`). See "Package compatibility" in the
README.
