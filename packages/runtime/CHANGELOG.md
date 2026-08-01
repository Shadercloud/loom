# @loom-dev/runtime

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
  - @loom-dev/scene@0.6.0

## 0.5.3

### Patch Changes

- [`60ee957`](https://github.com/astra-void/loom/commit/60ee957ba6c1936d3614029446ce7d2ec1df9228) Thanks [@astra-void](https://github.com/astra-void)! - Fix two class-registry gaps that made loom warn about — and in one case
  mis-render — classes it already supports.

  - `CollectionService` was missing from the runtime's `CLASS_PARENTS` table even
    though the service itself is fully implemented. Because `@rbxts/react`'s `Tag`
    prop resolves the service on every tagged mount, the first tagged component in
    a preview logged `[loom] unknown class "CollectionService" — treating it as a
direct Instance subclass`. The service is registered now, so tagged trees mount
    silently and `IsA("CollectionService")` answers correctly.
  - The React adapter's intrinsic → class-name map omitted `uipagelayout`,
    `uitablelayout` and `uitextsizeconstraint`, so the fallback casing minted
    `Uipagelayout`. An unknown class participates in layout, which meant these
    modifiers were laid out and painted as plain grey boxes on top of the UI they
    were meant to modify. Mapped to their real casing they join the non-layout
    modifier set and render as nothing — loom still implements none of their
    behavior, but an app that uses one no longer gets a stray box.

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

- Updated dependencies []:
  - @loom-dev/scene@0.5.3

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

- Updated dependencies []:
  - @loom-dev/scene@0.5.2

## 0.5.1

### Patch Changes

- Updated dependencies []:
  - @loom-dev/scene@0.5.1

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

- Updated dependencies []:
  - @loom-dev/scene@0.5.0

## 0.4.0

### Patch Changes

- Updated dependencies []:
  - @loom-dev/scene@0.4.0

## 0.3.0

### Patch Changes

- Updated dependencies []:
  - @loom-dev/scene@0.3.0

## 0.2.1

### Patch Changes

- Updated dependencies []:
  - @loom-dev/scene@0.2.1

## 0.2.0

### Patch Changes

- Updated dependencies []:
  - @loom-dev/scene@0.2.0
