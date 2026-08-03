# @loom-dev/renderer

## 0.9.0

### Minor Changes

- [`14a2294`](https://github.com/astra-void/loom/commit/14a229432c4f665e3e5fb88b62f23d59253039c8) Thanks [@astra-void](https://github.com/astra-void)! - Load the engine's fonts in the preview, and know the rest of them by name
  (reported in [#11](https://github.com/astra-void/loom/issues/11)).

  **The preview now loads the faces.** `@loom-dev/renderer/fonts` has shipped real
  font files since 0.7.0 — Fontsource `woff2` in the bundle, no CDN and nothing
  installed on the machine — but it was an opt-in import and the preview never
  made it, so out of the box every Roblox family fell through to `system-ui`: SF
  Pro on macOS, Segoe UI on Windows, Roboto on Linux. `AutomaticSize` and
  `TextWrapped` are driven by _measuring_ the face, so the same scene laid out
  differently on each. The import now sits in the globals module, which is
  injected ahead of the app entry whichever frontend it uses, so a vide preview
  gets the same faces as a react one.

  **And it covers the list now, not four of it.** `SourceSans`, `Roboto`,
  `RobotoMono` and `Inconsolata` were the only families with a face; every other
  name loom did not recognise resolved to the generic sans stack _silently_, since
  the missing-face warning only fires for families it knows about. Twenty-eight
  families now register a real face — Jura, Merriweather, Nunito, Oswald, Ubuntu,
  TitilliumWeb, JosefinSans, GrenzeGotisch, RobotoCondensed, Arimo, Sarpanch,
  Michroma, AmaticSC, Bangers, Creepster, DenkOne, Fondamento, FredokaOne,
  IndieFlower, Kalam, LuckiestGuy, PatrickHand, PermanentMarker and SpecialElite
  alongside the original four. All OFL-1.1 bar Ubuntu, which is under the Ubuntu
  Font Licence.

  The rest of the engine's list is at least _named_ now, so it resolves to a stack
  that leads with the right typeface and warns instead of drifting in silence:
  `Gotham` and `BuilderSans` (proprietary), `Bodoni`, `Garamond`, `Cartoon`,
  `SciFi`, `Arcade`, `Fantasy`, `Antique`, `Highway`. `Arial` and `Legacy` need
  nothing — Arimo is metric-compatible with Arial and is now in their stack.

  **`Enum.Font` is the engine's whole enum**, all 53 items in its own order,
  instead of the sixteen loom happened to paint. `Enum.Font.Jura` was `undefined`
  in a preview, so a scene that named it crashed before it drew anything, and
  `Font.fromEnum` sent every unrecognised item to `SourceSansPro`; it now resolves
  each item's own family.

  `FredokaOne` is the one approximation: Google folded "Fredoka One" into
  Fredoka's heavier weights, so Fredoka is what registers for it.

  Sizes, since this is a font shipment: a static gallery build emits ~2.8 MB of
  `woff2` across the whole set. What a _page_ downloads is unchanged — Fontsource
  declares per-script `unicode-range` subsets, so a browser fetches only the
  families and scripts a scene actually paints with.

### Patch Changes

- Updated dependencies [[`14a2294`](https://github.com/astra-void/loom/commit/14a229432c4f665e3e5fb88b62f23d59253039c8)]:
  - @loom-dev/runtime@0.9.0
  - @loom-dev/scene@0.9.0

## 0.8.1

### Patch Changes

- [`9cf0372`](https://github.com/astra-void/loom/commit/9cf037253244bcabdc145251c5a3013b33c03c44) Thanks [@astra-void](https://github.com/astra-void)! - Stop cutting the descenders off wrapped text. A paragraph's last line lost the
  tails of its `y`, `p` and `g` — `activity` painting as `activitv` — and at a
  large enough `TextSize` the first line lost the tops of its ascenders too
  (reported in [#11](https://github.com/astra-void/loom/issues/11)).

  `TextSize` means different things to the two renderers, and the label's box is
  sized in the engine's. Roblox fits the whole face into `TextSize`: one line of
  it measures exactly `TextSize` tall and nothing pokes out. CSS spends it on the
  em instead, and a face's own ascent + descent runs to ~1.2em on top of that. The
  overlay was clipped to the box the layout computed — the engine's height,
  `TextSize + (n - 1) * TextSize * LineHeight` — so the browser's taller line
  boxes had nowhere to go, and the clip took the difference out of the glyphs.

  The overlay's clip rect now carries that overhang, with padding handing the
  content box its original height straight back: the text is placed exactly where
  it was, `TextXAlignment`/`TextYAlignment` are untouched, and a label still clips
  its own text at its left and right edges. Nothing about the layout moves —
  `TextBounds`, `AbsoluteSize` and every rect around the label are the values they
  were.

  The room needed turns out to be the same at both edges, and the same whatever
  `LineHeight` is set to and however many lines the text wraps onto: lines 2..n
  sit on `TextSize * LineHeight` of pitch in either renderer and cancel, leaving
  one face box against one `TextSize`, split evenly above and below. It is
  measured per typeface and size, and re-measured when a face registered with
  `registerFont` finishes loading and the metrics behind it change.

  Also fixed: a label whose `LineHeight` was the only thing to change kept its old
  line spacing, since the fingerprint that decides whether to repaint the overlay
  did not read the property.

- Updated dependencies []:
  - @loom-dev/scene@0.8.1
  - @loom-dev/runtime@0.8.1

## 0.8.0

### Patch Changes

- Updated dependencies [[`7d30cf0`](https://github.com/astra-void/loom/commit/7d30cf05a00f7783793a969dcd3598447ddbc48e)]:
  - @loom-dev/runtime@0.8.0
  - @loom-dev/scene@0.8.0

## 0.7.1

### Patch Changes

- Updated dependencies []:
  - @loom-dev/scene@0.7.1
  - @loom-dev/runtime@0.7.1

## 0.7.0

### Minor Changes

- [`47e4796`](https://github.com/astra-void/loom/commit/47e4796df59a746194607806ea8145545fba4490) Thanks [@astra-void](https://github.com/astra-void)! - Close the five gaps loom kept documenting instead of implementing: the last two
  layouts, the image modes, asset ids in a static build, the missing datatype
  members, and the services a UI actually reaches for. Every behaviour below was
  read off a running engine (Studio) rather than inferred.

  **`UITableLayout` and `UIPageLayout`.** A table's lines are its layout's
  siblings and their children are the cells; a column takes its widest cell and a
  row its tallest, both measured against the table's own content box, and
  `FillEmptySpaceColumns`/`Rows` scale the tracks proportionally in either
  direction. A pager's pages keep their own size and sit one container-plus-
  `Padding` apart, so `ClipsDescendants` shows exactly one; `JumpToIndex`/`JumpTo`/
  `Next`/`Previous` work off a ref and fire `PageLeave`/`PageEnter`/`Stopped`.
  Since the engine's `CurrentPage` is a GuiObject reference, which a Scene IR
  property cannot carry, the layout engine reads a `CurrentPageIndex` int that the
  runtime keeps in step.

  **`SortOrder` now defaults to `Name`** on every layout, which is the engine's own
  default — a list whose children carry distinct `Name`s flows alphabetically
  unless it sets `SortOrder`. Equal names keep source order, so a tree that never
  sets `Name` is unaffected.

  **Images.** `Slice` (from `SliceCenter`, scaled by `SliceScale`), `Tile` (at
  `TileSize`), the `ImageRectOffset`/`ImageRectSize` sprite window and
  `ResampleMode.Pixelated` all paint. The image layer is a background-painted
  element rather than an `<img>`, since a sprite window and a 9-slice both place a
  _region_ of the source. Tiling a sprite window is still not reproducible in CSS
  and now warns instead of pretending.

  **`rbxassetid://` in a static build.** `vite build`/`loom build` resolve the
  asset ids the bundle mentions, download the images into the output, and emit a
  `__loom/assets.json` the page reads — so a static preview paints them with no
  server. Opt out with `loomPreview({ assets: false })`.

  **Datatypes.** `Color3:ToHex()` (lowercase, unprefixed, the exact inverse of
  `fromHex`), `ToHSV`/`fromHSV`, `Vector2`'s `Unit`/`Dot`/`Cross`/`Lerp`/`Min`/
  `Max`/`Abs` and axis constants, the same for `Vector3`, `UDim2:Lerp`, and a
  `Rect` that encodes into the IR.

  **Services.** `TextService` measures with the renderer's own fonts
  (`GetTextSize`, `GetTextBoundsAsync`), `Debris.AddItem` destroys on a real timer,
  `StarterGui` answers the core-UI calls, and the container-only services
  (`ReplicatedStorage`, `Lighting`, `SoundService`, …) resolve to real instances
  instead of warned stubs.

### Patch Changes

- Updated dependencies [[`47e4796`](https://github.com/astra-void/loom/commit/47e4796df59a746194607806ea8145545fba4490)]:
  - @loom-dev/scene@0.7.0
  - @loom-dev/runtime@0.7.0

## 0.6.8

### Patch Changes

- Updated dependencies []:
  - @loom-dev/scene@0.6.8
  - @loom-dev/runtime@0.6.8

## 0.6.7

### Patch Changes

- Updated dependencies []:
  - @loom-dev/scene@0.6.7
  - @loom-dev/runtime@0.6.7

## 0.6.6

### Patch Changes

- Updated dependencies [[`45b3278`](https://github.com/astra-void/loom/commit/45b3278d157646302e33f8abd1a9dafeed7d3c29)]:
  - @loom-dev/scene@0.6.6
  - @loom-dev/runtime@0.6.6

## 0.6.5

### Patch Changes

- Updated dependencies []:
  - @loom-dev/scene@0.6.5
  - @loom-dev/runtime@0.6.5

## 0.6.4

### Patch Changes

- Let the host install the engine's typefaces, and stop silently drifting per OS when it hasn't.

  Loom named the Roblox families in CSS (`font-family: "Gotham", system-ui, …`) and loaded nothing behind them, so on a machine without the font installed every family resolved to `system-ui` — SF Pro on macOS, Segoe UI on Windows, Roboto on Linux. Three typefaces, three sets of advance widths, and `AutomaticSize` and `TextWrapped` are driven by measuring those widths: the same scene laid out differently on each, with nothing pointing at the font as the reason.

  - **`registerFont(family, { family, faces, fallback })`** installs a typeface for one Roblox family, following the `setImageResolver` contract already used for `rbxassetid://`. Any spelling of the name reaches it — `Gotham`, `GothamBold` and a `GothamSSm` `FontFace` are one family — and `faces` declares `@font-face` rules for a family the page has not loaded itself. `clearRegisteredFonts()` takes it all back out.
  - **A late face re-lays-out.** Text bounds are measured against whatever the browser had at the time, so a registration (or a `@font-face` finishing its download) invalidates every `AutomaticSize` bound that came out of the old one. Both adapters subscribe to `onFontsChanged` and measure again, so the settled layout is the one the registered face produces rather than the fallback's.
  - **`import "@loom-dev/renderer/fonts"`** registers the Roblox families that are openly licensed — `SourceSans` (Source Sans 3), `Roboto`, `RobotoMono` and `Inconsolata`, all OFL-1.1. These are the _actual_ fonts the engine draws with, so their metrics are the engine's rather than an approximation. It is a separate entry point with the font packages behind it, so a project that does not import it ships none of it.
  - **`Gotham` cannot ship here.** Roblox's default family — and the Builder faces behind it today — is proprietary. A project that has the files registers them itself, with the same call `/fonts` makes.
  - **Unbacked families now say so, once each**, naming the family and what to do about it, rather than leaving a layout that is simply different on a different machine. Availability is decided by probe-string width, not `document.fonts.check()`, which answers "would this resolve" and so returns true for a family nobody has.

- Updated dependencies []:
  - @loom-dev/scene@0.6.4
  - @loom-dev/runtime@0.6.4

## 0.6.3

### Patch Changes

- [`abe2845`](https://github.com/astra-void/loom/commit/abe28455deb7f12b2a467e6a7ada8b6602f01f97) Thanks [@astra-void](https://github.com/astra-void)! - Round each `UICorner` corner on its own, and draw a `UIStroke` on the side of the edge it asks for.

  - **`TopLeftRadius` … `BottomRightRadius` are applied**, each overriding `CornerRadius` for its own corner. That is how a card rounds only its top while its footer rounds only its bottom — a shape that came out square before, since only `CornerRadius` was read. Everything drawn from the same box follows: the `UIStroke` ring and the `UIShadow` are box-shadows, so they take the new radius for free. A radius that returns to zero now squares the box off again instead of keeping the last rounding it had. Thanks to [@Shadercloud](https://github.com/Shadercloud) for the report and the first cut in [#10](https://github.com/astra-void/loom/pull/10).
  - **`UIStroke.BorderStrokePosition`**: `Outer` (the default, and what was always drawn) spreads outward, `Inner` insets so the stroke eats into the object instead of inflating it — a bordered header stays flush with the card around it rather than overhanging it — and `Center` straddles the edge with half the thickness each way.
  - **`UIStroke.Enabled = false` and a fully transparent stroke paint nothing**, matching what `UIShadow` already did, and a stroke that is switched off takes its ring with it instead of leaving it on the element.

- [`abe2845`](https://github.com/astra-void/loom/commit/abe28455deb7f12b2a467e6a7ada8b6602f01f97) Thanks [@astra-void](https://github.com/astra-void)! - `LineHeight` spaces out wrapped text, the way the engine does.

  The multiplier is read, clamped to the 1…3 Studio allows, and spent **between** lines: `n` lines measure `TextSize + (n - 1) * TextSize * LineHeight`, so a one-line label is exactly `TextSize` tall however high its `LineHeight` is. CSS instead gives every line box the full `line-height`, half of the extra above the text and half below, so the leading is cropped off the two outer edges of the block — the paint then lands where `AutomaticSize` measured it.

  A library that sets a per-variant `LineHeight` on every label (1.25 for a heading, 1.4 for body copy) got single-spaced paragraphs before this, and an `AutomaticSize.Y` container measured to match.

- Updated dependencies [[`abe2845`](https://github.com/astra-void/loom/commit/abe28455deb7f12b2a467e6a7ada8b6602f01f97)]:
  - @loom-dev/scene@0.6.3
  - @loom-dev/runtime@0.6.3

## 0.6.2

### Patch Changes

- Updated dependencies []:
  - @loom-dev/scene@0.6.2
  - @loom-dev/runtime@0.6.2

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
