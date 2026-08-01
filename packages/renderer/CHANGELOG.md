# @loom-dev/renderer

## 0.6.1

### Patch Changes

- [`3c32df7`](https://github.com/astra-void/loom/commit/3c32df745836a34e4f1df05b0099ef9108556763) Thanks [@astra-void](https://github.com/astra-void)! - Make previews usable on a phone.

  - **The stage keeps a desktop viewport instead of overflowing.** Below 960px wide the preview mount lays out at 960 logical pixels and is scaled down with a CSS transform to fit the real screen, so a UI written for a desktop viewport shrinks rather than running off the edge. The logical height follows the real aspect ratio (no letterboxing), and at 960px or wider nothing is applied at all — desktop previews are unchanged. The generated pages use `dvh`, so a full-height stage no longer hangs under the mobile browser toolbars.
  - **Pointer coordinates follow the scale.** The renderer converts on-screen pixels back into layout pixels (`MouseEnter`/`Activated`/`InputChanged` positions, `GetMouseLocation`, wheel deltas) by reading the mount's own rendered-to-layout ratio, so hit testing lands where the scene looks like it is.
  - **ScrollingFrames scroll from a touch drag.** There is no wheel on a phone; a drag now moves `CanvasPosition` with the same clamping the wheel uses, and past a small slop it stops counting as a tap so the control under the finger is not activated. Only ScrollingFrames opt out of native touch panning — a preview embedded in a docs page never traps the reader — and taps no longer wait for the browser's double-tap-zoom timeout.
  - **The gallery chrome stacks on a narrow screen.** The 248px sidebar becomes a top bar with a `targets` button that opens the list and closes it again on selection, leaving the rest of the screen to the stage. `?chrome=none` (the docs-site iframes) is unaffected.

- [`ceb5b7e`](https://github.com/astra-void/loom/commit/ceb5b7ed4dbc452d776c14bb5090bb7efa0d1665) Thanks [@astra-void](https://github.com/astra-void)! - Run a real third-party roblox-ts UI library (`@rbxts/react-clean-ui`) end to end, and close every gap it hit:

  - `UIListLayout.Wraps` now wraps, per line, like CSS `flex-wrap` — lines break on the fill axis, each line aligns its own items, the stack of lines aligns as a block, flex distributes per line, and `AutomaticSize` measures the wrapped shape.
  - `UIShadow` renders as a CSS drop shadow, layered under a `UIStroke` ring instead of replacing it.
  - `ImageColor3` tints, through an `feColorMatrix` that is the same per-channel multiply the engine does — so a full-colour image tints as correctly as a monochrome icon. One filter per colour, none at all for the default white.
  - `RichText` markup is parsed and painted: `<b>`, `<i>`, `<u>`, `<s>`, `<br/>`, `<font>` (colour, size, face, family, weight, transparency), `<uppercase>`/`<smallcaps>` and the character entities. With the flag off the same string stays literal, as in Roblox, and anything the engine would not recognise stays literal too. `AutomaticSize` measures each run in the font its own tags ask for, so a bold or resized run no longer clips the label.
  - `import ReactRoblox from "@rbxts/react-roblox"` works: the preview's stand-in exports the namespace object, matching upstream's `export =` typings.
  - The `rbxassetid://` route is built from the configured base again, so assets resolve under a mounted gallery (the Next integration, the Astro embed) instead of 404ing.
  - roblox-ts `.size()` / `.isEmpty()` resolve on `Map` and `Set`, through a symbol the preview rewrites previewed source to — leaving every other `Map` in the page (React's, loom's own scheduler) on plain JS semantics.
  - `UDim.add` / `UDim.sub`, `NumberSequence` / `NumberSequenceKeypoint`, and `BindableEvent` (`.Event`, `:Fire()`) are available to previewed code.
  - React's prop diff now uses Roblox `==`, which compares datatypes **by value**. A component that rebuilds `Position={UDim2.fromScale(.5,.5)}` every render no longer counts as a change, so a value written outside React — a drag moving a window, motion code on a ref — survives the next render instead of being overwritten.
  - `TextWrapped` text wraps. The deprecated `TextWrap` alias is read as the same property (Roblox's docs call it "simply an alias"), and measurement lays the runs into lines at word boundaries instead of always measuring one long line — constrained by the object's own width, or by the parent's when the X axis is automatic. Wrapped text is re-measured once the layout has sized its container, converging on the second pass.
  - A `GuiObject` the app listens to is hit-testable whether or not it is `Active`. Roblox's `Active` governs whether input is _sunk_, not whether the object hears it, so a slider handle — a plain `Frame` with an `InputBegan` handler — never received a pointer event. Frames with no listeners stay click-through, so a transparent positioning layer still lets clicks through to what is underneath.
  - The datatypes stringify the way the engine does (`Vector2` → `"2, 8"`, `UDim2` → `"{0.5, 10}, {0, 20}"`, `Color3` → `"1, 0, 0"`). A label reading `Range Slider (${value})` printed `[object Object]`.
  - `@rbxts/react`'s `Children.map` / `Children.forEach` count from **1**, as React-Lua does (`ReactChildren.lua` marks the line a ROBLOX DEVIATION). roblox-ts code recovering a 0-based position writes `index - 1`, so browser React's 0-based index shifted every result by one — a `<Select>` keyed on it selected and displayed its neighbour.
  - `UIListLayout` / `UIGridLayout` report `AbsoluteContentSize`, fed back after layout like the `ScrollingFrame` metrics and gated on real change. A dropdown that sizes itself from `Change={{ AbsoluteContentSize }}` collapsed to zero height without it, clipping away everything inside — click targets included.
  - An empty `TextBox` is measured against its `PlaceholderText`, which is what it displays. Measuring the empty string collapsed an `AutomaticSize.Y` input to zero height: invisible as well as unclickable.
  - Reading a `GuiObject` property nobody has written yields its Roblox default (`Visible`, `ZIndex`, `BackgroundTransparency`, `Rotation`, `LayoutOrder`, `Active`, `ClipsDescendants`, `AnchorPoint`, `Position`, `Size`) instead of `undefined`. App code that branches on one — a drag's `descendant.Visible` hit test — took the wrong path for every node.

- Updated dependencies [[`ceb5b7e`](https://github.com/astra-void/loom/commit/ceb5b7ed4dbc452d776c14bb5090bb7efa0d1665)]:
  - @loom-dev/runtime@0.6.1
  - @loom-dev/scene@0.6.1

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
