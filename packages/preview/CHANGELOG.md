# @loom-dev/preview

## 0.6.0

### Minor Changes

- [#8](https://github.com/astra-void/loom/pull/8) [`68701b7`](https://github.com/astra-void/loom/commit/68701b77ce4bd0a31168687e83c4e08d683efd53) Thanks [@Shadercloud](https://github.com/Shadercloud)! - Add the legacy `FontSize` property, the Luau string methods and `assert`, and
  treat `Size` as a floor under `AutomaticSize`.

  - `Enum.FontSize` and the `FontSize` prop are supported end to end. The pixel
    size is read out of the enum name, so `FontSize={Enum.FontSize.Size24}` paints
    and measures at 24px. `TextSize` still wins when both are set, matching how
    Roblox keeps the two properties linked.
  - `String.prototype` gains the Luau string methods roblox-ts calls off a string
    receiver — `.lower()`, `.upper()`, `.sub()`, `.rep()`, `.find()`, `.gsub()`
    and `.format()` — each delegating to the existing `string` library, so the
    1-based indices and tuple returns carry over. `.sub()` deliberately replaces
    the Annex B HTML wrapper JS ships under that name; `.split()` is deliberately
    left native, since Luau's `string.split` is implemented with it.
  - `assert` joins the installed Luau globals. It returns its argument when
    truthy, the way Luau does, so `const cfg = assert(maybeCfg, "no cfg")` works.
  - `AutomaticSize` no longer shrinks an element below its own `Size`. Roblox
    treats `Size` as the minimum and only grows past it for larger content; loom
    was overwriting the size with the content size outright, so a fixed-width
    container with a small child collapsed to the child.

- [#9](https://github.com/astra-void/loom/pull/9) [`06b8636`](https://github.com/astra-void/loom/commit/06b8636e0b3a55001cc81f0db73b183195c75c93) Thanks [@Shadercloud](https://github.com/Shadercloud) and [@astra-void](https://github.com/astra-void)! - Render `ImageLabel` and `ImageButton`.

  Image classes now paint their `Image` in an `<img>` layer beneath the text,
  honoring `ScaleType` (`Stretch`/`Fit`/`Crop`) and `ImageTransparency`. Plain
  `http(s):`, `data:` and `blob:` URLs load directly.

  `rbxassetid://` needs a hop the browser cannot make on its own — Roblox's
  thumbnail API sends no CORS headers — so the renderer takes a host-installed
  resolver via `setImageResolver` and ships no default rather than routing every
  consumer's asset traffic through some third party's proxy. `@loom-dev/preview`
  installs one backed by a new dev-server route that resolves the id server-side
  and redirects to the CDN image, so asset ids paint under `loom preview`, the
  embedded server and Next dev with no configuration. Resolutions are cached on
  both sides, so a repaint never re-resolves. A static gallery build has no
  server to ask: pass real URLs there, or install your own resolver.

  `Enum.ScaleType` is added. `Slice` and `Tile` are accepted but paint as
  `Stretch`, as do `ImageColor3` tints and `ImageRectOffset`/`ImageRectSize`
  sprite windows — each needs more than one `<img>`.

### Patch Changes

- Updated dependencies [[`68701b7`](https://github.com/astra-void/loom/commit/68701b77ce4bd0a31168687e83c4e08d683efd53), [`06b8636`](https://github.com/astra-void/loom/commit/06b8636e0b3a55001cc81f0db73b183195c75c93)]:
  - @loom-dev/runtime@0.6.0
  - @loom-dev/react@0.6.0
  - @loom-dev/renderer@0.6.0

## 0.5.3

### Patch Changes

- [`de7d915`](https://github.com/astra-void/loom/commit/de7d915563173a6c35a75c0f14d5453fc53d9ff7) Thanks [@astra-void](https://github.com/astra-void)! - Add browser-compatible `HttpService.GenerateGUID` support and implement
  `Color3.fromHex`, allowing roblox-ts UI projects that generate component IDs and
  define themes with hexadecimal colors to render in Loom unchanged.

  ```ts
  import { HttpService } from "@rbxts/services";

  const id = HttpService.GenerateGUID(false);
  const accent = Color3.fromHex("#6366F1");
  ```

  Both lines used to fail: the import with `The requested module
"@rbxts/services" does not provide an export named "HttpService"` (the alias
  module exports an explicitly reviewed list, and loom had no `HttpService` to
  put in it), the theme with `Color3.fromHex is not a function`.

  - `HttpService` is now a real service instance in the runtime registry, so
    `game.GetService("HttpService")` and the `@rbxts/services` export are the same
    singleton. `GenerateGUID` returns an RFC 9562 v4 UUID from the Web Crypto API
    — `crypto.randomUUID()`, or `crypto.getRandomValues()` with the version and
    variant bits set explicitly — braced by default, and throws rather than
    falling back to a weak identifier when Web Crypto is unavailable.
    `JSONEncode` / `JSONDecode` come with it; `GetAsync`, `PostAsync` and
    `RequestAsync` throw by name, because a preview never issues requests on your
    behalf.
  - `Color3.fromHex` accepts exactly six RGB hex digits, either case, with or
    without one leading `#`, and converts through the existing `Color3.fromRGB`
    path. CSS shorthand, alpha channels, `0x` notation and stray whitespace are
    rejected with a located loom error instead of being silently reinterpreted.

- Updated dependencies [[`60ee957`](https://github.com/astra-void/loom/commit/60ee957ba6c1936d3614029446ce7d2ec1df9228), [`de7d915`](https://github.com/astra-void/loom/commit/de7d915563173a6c35a75c0f14d5453fc53d9ff7)]:
  - @loom-dev/runtime@0.5.3
  - @loom-dev/react@0.5.3

## 0.5.2

### Patch Changes

- [`ba578d4`](https://github.com/astra-void/loom/commit/ba578d4556322f8739630fe5bc46d03652dcb61e) Thanks [@astra-void](https://github.com/astra-void)! - Replace the hand-written `@rbxts/react` shim with an audited browser
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

- Updated dependencies [[`ba578d4`](https://github.com/astra-void/loom/commit/ba578d4556322f8739630fe5bc46d03652dcb61e)]:
  - @loom-dev/react@0.5.2
  - @loom-dev/runtime@0.5.2

## 0.5.1

### Patch Changes

- [`225a3e5`](https://github.com/astra-void/loom/commit/225a3e5fb64d729ed1b3ec6501da86d6983726d6) Thanks [@astra-void](https://github.com/astra-void)! - Add browser runtime compatibility for `@rbxts/ripple` and `@rbxts/react-ripple`,
  preventing Luau package entries from reaching Vite and Rollup during gallery
  development and static builds.

  Both packages publish a Luau runtime (`"main": "src/init.luau"`) and a `.d.ts`,
  so normal resolution handed Rollup a Luau file and `loom build` / `next build`
  failed with `Expected ';', '}' or <eof>` — while development could look fine,
  because a gallery target is only fetched when it is opened. Both packages now
  alias to loom's own adapters, in serve and build alike.

  The adapters are a port of the published implementation, not a stub:
  `createSpring`, `createTween`, `createMotion`, `config`, `easing` and the
  `useSpring` / `useTween` / `useMotion` hooks, animating `number`, `Vector2`,
  `Vector3`, `Color3`, `UDim`, `UDim2`, `Rect` and records of numbers. `CFrame`
  throws with a named loom error rather than animating. Controllers share one
  `RunService.Heartbeat` connection and release it when the last one settles.

  `@loom-dev/react` gains the React bindings this needs: `createBinding`,
  `useBinding` and `joinBindings` (re-exported from `@rbxts/react`), with every
  host prop accepting a value or a `Binding` of one. A bound prop is written
  straight onto the live instance, so an animation costs no React renders.

- [`225a3e5`](https://github.com/astra-void/loom/commit/225a3e5fb64d729ed1b3ec6501da86d6983726d6) Thanks [@astra-void](https://github.com/astra-void)! - Add zero-config Loom compatibility for the root `@rbxts/ui-labs` `Environment`
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

- [`225a3e5`](https://github.com/astra-void/loom/commit/225a3e5fb64d729ed1b3ec6501da86d6983726d6) Thanks [@astra-void](https://github.com/astra-void)! - Add a `shims` option for roblox-ts packages loom can't run in the browser.

  A declaration-only Luau package (`"main": "src/init.lua"` plus a `.d.ts`, no
  `src/index.ts`) has no source entry the `.luau`-main fallback can redirect to,
  so importing one fails with `Failed to resolve entry for package`.
  `shims: { "<specifier>": "<module>" }` redirects the package to a browser module
  the project supplies — exact-match only, applied before loom's own `@rbxts/*`
  aliases, and available on every entry path (`loomPreview()`, `loom.config.ts`,
  `loom-dev/embed`, `withLoomGallery()`). See "Package compatibility" in the
  README.

- Updated dependencies [[`225a3e5`](https://github.com/astra-void/loom/commit/225a3e5fb64d729ed1b3ec6501da86d6983726d6)]:
  - @loom-dev/react@0.5.1
  - @loom-dev/runtime@0.5.1

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
