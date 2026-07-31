# @loom-dev/react

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

- Updated dependencies []:
  - @loom-dev/scene@0.5.1
  - @loom-dev/layout@0.5.1
  - @loom-dev/runtime@0.5.1
  - @loom-dev/renderer@0.5.1

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
  - @loom-dev/renderer@0.5.0
  - @loom-dev/layout@0.5.0

## 0.4.0

### Patch Changes

- Updated dependencies []:
  - @loom-dev/scene@0.4.0
  - @loom-dev/layout@0.4.0
  - @loom-dev/runtime@0.4.0
  - @loom-dev/renderer@0.4.0

## 0.3.0

### Patch Changes

- Updated dependencies []:
  - @loom-dev/scene@0.3.0
  - @loom-dev/layout@0.3.0
  - @loom-dev/runtime@0.3.0
  - @loom-dev/renderer@0.3.0

## 0.2.1

### Patch Changes

- Updated dependencies []:
  - @loom-dev/scene@0.2.1
  - @loom-dev/layout@0.2.1
  - @loom-dev/runtime@0.2.1
  - @loom-dev/renderer@0.2.1

## 0.2.0

### Patch Changes

- Updated dependencies []:
  - @loom-dev/scene@0.2.0
  - @loom-dev/layout@0.2.0
  - @loom-dev/runtime@0.2.0
  - @loom-dev/renderer@0.2.0
