# @loom-dev/renderer

## 0.6.0

### Minor Changes

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
  - @loom-dev/scene@0.6.0

## 0.5.3

### Patch Changes

- Updated dependencies [[`60ee957`](https://github.com/astra-void/loom/commit/60ee957ba6c1936d3614029446ce7d2ec1df9228), [`de7d915`](https://github.com/astra-void/loom/commit/de7d915563173a6c35a75c0f14d5453fc53d9ff7)]:
  - @loom-dev/runtime@0.5.3
  - @loom-dev/scene@0.5.3

## 0.5.2

### Patch Changes

- Updated dependencies [[`ba578d4`](https://github.com/astra-void/loom/commit/ba578d4556322f8739630fe5bc46d03652dcb61e)]:
  - @loom-dev/runtime@0.5.2
  - @loom-dev/scene@0.5.2

## 0.5.1

### Patch Changes

- Updated dependencies []:
  - @loom-dev/scene@0.5.1
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

- Updated dependencies []:
  - @loom-dev/runtime@0.5.0
  - @loom-dev/scene@0.5.0

## 0.4.0

### Patch Changes

- Updated dependencies []:
  - @loom-dev/scene@0.4.0
  - @loom-dev/runtime@0.4.0

## 0.3.0

### Patch Changes

- Updated dependencies []:
  - @loom-dev/scene@0.3.0
  - @loom-dev/runtime@0.3.0

## 0.2.1

### Patch Changes

- Updated dependencies []:
  - @loom-dev/scene@0.2.1
  - @loom-dev/runtime@0.2.1

## 0.2.0

### Patch Changes

- Updated dependencies []:
  - @loom-dev/scene@0.2.0
  - @loom-dev/runtime@0.2.0
