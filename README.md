# Loom

Render Roblox UI as a live web DOM preview.

Loom takes a Roblox GUI tree — produced from `@rbxts/react` or `vide` today, and
from Luau later — and renders it in the browser with Roblox-accurate layout. The
pipeline is built around a single framework-agnostic contract, the **Scene IR**,
so any frontend can plug into the same layout + rendering core.

```
 @rbxts/react ─┐
   vide        ├─►  Frontend Adapter  ─►  Scene IR  ─►  Layout Engine  ─►  DOM Renderer  ─►  Browser DOM
   luau        ┘       (TS, swappable)     (contract)      (Rust → WASM)        (TS)
```

## Quick start

### As a Vite plugin

Already have (or want) a `vite.config.ts`? The plugin is the whole setup:

```sh
npm i -D @loom-dev/preview vite
```

```ts
// vite.config.ts
import { loomPreview } from "@loom-dev/preview/vite";
import { defineConfig } from "vite";

export default defineConfig({ plugins: [loomPreview()] });
```

`vite` and `vite build` now work against a roblox-ts source tree as-is — **no
`index.html`, no entry wiring, no aliases**. `loomPreview()` generates the page
around the detected client entry (`src/main.client.tsx` and friends), points
`@rbxts/react` / `@rbxts/react-roblox` / `@rbxts/services` / `@rbxts/vide` at the
loom adapters, pins one react, installs the Roblox datatype globals, sets the
automatic JSX runtime, and rewrites roblox-ts `import X = require(...)`. HMR
comes free from Vite. Options:

```ts
loomPreview({
  entry: "src/ui/boot.tsx", // only if the entry isn't a conventional name
  targets: "src/scenes",    // gallery mode: a glob, a dir, a list, or true
  title: "my UI",           // <title> of the generated page
  html: false,              // opt out of the generated page entirely
  shims: {},                // package redirects — see "Package compatibility"
})
```

A project that keeps its own `index.html` gets to use it — the plugin only fills
in when there is none (gallery mode is the exception: its page always wins).

### As a CLI

Or skip the config file entirely:

```sh
loom preview [dir] [--port <n>] [--host] [--targets [glob]]
loom build   [dir] --targets [glob] [--out <dir>] [--base <path>]
```

`preview` boots a Vite dev server with the plugin pre-applied — same generated
page, same entry detection. `--targets` switches to **gallery mode**: every
`**/*.loom.tsx` under the directory gets a sidebar entry with lazy mounts and
per-target error containment. `build` bundles that same gallery into a static,
client-only site (default `dist-preview/`) — which is exactly what `vite build`
does with `loomPreview({ targets })`.

Only `preview` reads `<dir>/loom.config.ts` (an optional default export of
`{ targets?, port? }`, used when the matching flag is absent). `build` does not
load it at all — `--targets` is required on every invocation.

### Working on loom itself

```sh
pnpm install                  # also builds the WASM layout engine (prepare hook)
pnpm --filter @loom-dev/playground dev     # react harness, own index.html
pnpm --filter @loom-dev/interactive dev    # plugin only, no index.html
pnpm --filter @loom-dev/gallery-demo dev   # plugin gallery mode
```

To embed the gallery in a host toolchain (a docs site, a design-system portal)
rather than run it as its own program, `loom-dev/embed` exposes both pipelines
programmatically:

```ts
import { buildGallery, createGalleryServer } from "loom-dev/embed";

// dev: mount on the host's own dev server
const gallery = await createGalleryServer({
  root: "../my-ui",
  targets: "src/scenes",
  base: "/loom-preview/",
});
hostServer.middlewares.use(gallery.middleware);

// build: emit the static gallery next to the host's own output
await buildGallery({
  root: "../my-ui",
  targets: "src/scenes",
  outDir: "dist/loom-preview",
});
```

The gallery keeps a Vite instance of its own — the plugin rewrites `react` and
`@rbxts/*` for the whole config it lives in, so the host forwards HTTP and
nothing else.

### In a Next.js app

Next.js can't mount the embed middleware on its dev server, so `loom-dev/next`
wraps the same isolated gallery in a config-level integration instead:

```ts
// next.config.ts
import { withLoomGallery } from "loom-dev/next";

export default withLoomGallery(
  { /* your Next config */ },
  { root: "../my-ui", targets: "src/scenes" },
);
```

That one wrapper is the whole setup, dev and build both — the Astro-embed
treatment, not a config kit:

- `next dev` lazily boots the gallery on its own ephemeral port and proxies
  `/loom-preview/*` to it through `rewrites()` — full HMR, and the host app's
  React (18, 19, whatever Next wants) is never touched, because the loom
  aliases live entirely in the gallery's own Vite instance. Works with webpack
  and Turbopack alike: the integration sits at Next's routing layer, not its
  bundler.
- `next build` emits the static gallery into `public/loom-preview`
  automatically (add it to `.gitignore`; `staticBuild: false` opts out for a
  CI that runs `loom build` itself), and `next start` just serves it — the
  wrapper's rewrite maps the bare mount path onto its `index.html`.

Options: `base` (default `/loom-preview/`), `port`, `hmrPort`, `staticBuild`,
`shims` (paths relative to `root` — see [Package compatibility](#package-compatibility)).
The wrapper returns a Next *function config* (phase-aware), and accepts yours
as an object or function — apply it outermost when composing wrappers, e.g.
around Fumadocs' `createMDX`:

```ts
// next.config.mjs of a Fumadocs site
export default withLoomGallery(withMDX(config), {
  root: "../my-ui",
  targets: "src/scenes",
});
```

Verified against both harnesses in `apps/`: `next-demo` (Next 15, pages
router, webpack, React 18) and `fumadocs-demo` (Fumadocs 16 on Next 16, App
Router, Turbopack, React 19, `proxy.ts` middleware) — the integration sits at
the routing layer, so none of those axes touch it.

Deep links keep working in both modes through the same `?target=<relPath>` /
`?chrome=none` URL contract, e.g. an
`<iframe src="/loom-preview/?chrome=none&target=src/scenes/Card.loom.tsx" />`
in a page. The `apps/next-demo` workspace app is a running example
(`pnpm --filter @loom-dev/next-demo dev`).

#### Fumadocs with a sibling Loom source tree

A docs app can live inside the Roblox UI project:

```text
react-clean-ui/
├── docs/          # Next.js + Fumadocs
│   └── next.config.mjs
├── out/           # compiled Luau
└── src/           # roblox-ts source
    └── Scenes/
        └── Button.loom.tsx
```

Apply the Loom wrapper outermost. Relative `root` values are resolved from the
Next app directory while `next.config.*` is evaluated, so `root: ".."` selects
`react-clean-ui`, not `react-clean-ui/docs` or Loom's installed package:

```js
// docs/next.config.mjs
import { withLoomGallery } from "loom-dev/next";

export default withLoomGallery(withMDX(config), {
  root: "..",
});
```

Gallery targets use an explicit named `preview` export; a normal default React
component is not a gallery entry:

```tsx
// src/Scenes/Button.loom.tsx
import React from "@rbxts/react";
import { Button } from "../Components";

export const preview = {
  render: () => <Button text="Hello World" />,
  title: "Button",
} as const;
```

Loom configures Vite's automatic JSX runtime, so the `React` import is optional
when the file uses only JSX. Keep it when the scene also references the
`React` namespace.

Open the full gallery at `http://localhost:3000/loom-preview` or embed one
target without gallery chrome:

```text
http://localhost:3000/loom-preview?chrome=none&target=src/Scenes/Button.loom.tsx
```

Development galleries support Windows, macOS, and Linux paths.

#### Gallery troubleshooting

- A black page plus a Vite error mentioning the gallery `shell.ts` or a
  malformed `/@fs/` URL is a shell-loading/path failure: the gallery UI never
  started. Current Loom releases generate Vite filesystem URLs for both POSIX
  and Windows paths.
- `invalid preview export in <target>` means the target module loaded, but it
  did not export `const preview = { render, title }`. Use the complete target
  example above; a default export alone is intentionally unsupported.
- `no *.loom.tsx targets found` (and the matching terminal warning) means
  `root` resolved successfully but no file matched `targets`. Check the root,
  filename suffix, and any configured target glob or directory.

## Package compatibility

Loom runs a roblox-ts source tree in a browser, so every package the tree
imports has to have something a browser can execute. Most roblox-ts packages
do: their `"main"` points at compiled Luau (`out/init.luau`), and loom
redirects them to their own TypeScript source at `src/index.ts(x)` — whether or
not the Luau was ever compiled. That is automatic and needs no configuration.

A **declaration-only** package has nothing to redirect to: a Luau runtime plus
`.d.ts` files and no TypeScript implementation —

```json
{ "main": "src/init.lua", "types": "src/index.d.ts" }
```

Declaration files are types, not code, and executing the Luau in a browser is
not an option, so such a package can only be answered by a browser module that
stands in for it. Loom ships that module for the packages whose browser meaning
is unambiguous, and lets you supply one for anything else.

### Built-in: `@rbxts/react`

Loom exposes the complete browser-meaningful runtime surface of the supported
`@rbxts/react` version (currently **17.3.7-ts.2**), forwarding standard React
APIs to one pinned React instance and adapting Roblox-specific APIs where
necessary. An existing roblox-ts React file compiles and runs unchanged:

```tsx
import React, {
  Component,
  PureComponent,
  ReactComponent,
  ReactPureComponent,
  createContext,
  createElement,
  createRef,
  forwardRef,
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "@rbxts/react";
```

#### Standard React

`Children`, `Component`, `PureComponent`, `Fragment`, `Profiler`,
`StrictMode`, `Suspense`, `cloneElement`, `createContext`, `createElement`,
`createRef`, `forwardRef`, `isValidElement`, `lazy`, `memo` and every hook come
straight from loom's own React 18 — **by identity**, not through wrappers:

```ts
import ReactDefault, { Component, useState } from "@rbxts/react";
import * as BrowserReact from "react";

ReactDefault.Component === Component; // true
Component === BrowserReact.Component;  // true
useState === BrowserReact.useState;    // true
```

That matters because `@loom-dev/react` is a `react-reconciler` host config: a
second React copy would mean a second hook dispatcher, and every function
component would throw *Invalid hook call*. Loom pins its React by absolute-path
alias, so a project that hoists React 19 for its own use keeps it — the gallery
still renders on loom's React 18.

#### `ReactComponent` / `ReactPureComponent`

Both decorators are the **identity function**. React-Lua needs them because it
has no `class` statement — upstream copies the decorated table onto a fresh
`Component:extend(...)`. Browser React already recognises a class that extends
`Component`, so loom hands the constructor straight back: nothing is wrapped or
subclassed, statics and `displayName` keep their identity, the prototype chain
is untouched, and the constructor is never invoked.

```tsx
@ReactComponent
export class Column extends Component<{ gap?: number }> {
  render() {
    return <frame />;
  }
}

Column === ReactComponent(Column); // true
```

Both TypeScript decorator dialects work: `experimentalDecorators` (what
roblox-ts projects enable) and TC39 standard decorators.

#### `Event`, `Change`, `Tag`

The handler-table props work as upstream documents them, and the renderer reads
them directly:

```tsx
<textbutton
  Event={{ Activated: (rbx) => print(rbx) }}
  Change={{ AbsoluteSize: (rbx) => print(rbx.AbsoluteSize) }}
  Tag="surface"
/>
```

`React.Event`, `React.Change` and `React.Tag` also exist as runtime values, and
the named imports are the same values as the ones on the default export:

```tsx
import { Change, Event, Tag } from "@rbxts/react";

<textbutton {...{ [Event.Activated]: onClick, [Tag]: "surface" }} />;
```

`Event` and `Change` mint a prefixed prop key for any signal or property name.
`Tag` is a single key, matching upstream, and it writes to a real
`CollectionService` in loom's runtime — `AddTag`, `RemoveTag`, `HasTag`,
`GetTags`, `GetTagged`, `GetAllTags`, `GetInstanceAddedSignal` and
`GetInstanceRemovedSignal` all work, and the tag is retracted when the element
unmounts. What a preview has no equivalent for is Studio's tag editor, so tags
only ever come from code.

#### Bindings

`createBinding`, `useBinding` and `joinBindings` come from `@loom-dev/react` —
the implementation the renderer resolves — so there is exactly one kind of
binding. A binding minted by `React.useBinding` and one minted by
`@rbxts/react-ripple`'s `useSpring` are the same object to the renderer, and
any host prop accepts a plain value or a `Binding` of one.

#### `React.None`

**Intentionally unsupported, and it says so.** React-Lua uses `None` to *delete*
a key from class-component state. React's update queue merges partial state with
`Object.assign({}, prev, partial)`, which can add and overwrite keys but never
remove one, and the only place that could change is `Component` itself — which
has to stay identical to browser React's for hooks and the reconciler to work.

`None` is still a real, importable value (`React.None === None`), so code that
merely mentions it keeps compiling. Using it in `setState` throws immediately,
naming the offending key, instead of letting the sentinel settle into state and
corrupt a render later. Set the field to `undefined` and treat that as absent,
or move the state into a hook where you own the whole value.

#### JSX runtime entrypoints

`@rbxts/react`, `@rbxts/react/jsx-runtime` and `@rbxts/react/jsx-dev-runtime`
all converge on the same React instance, as do bare `react`,
`react/jsx-runtime` and `react/jsx-dev-runtime`. Classic
(`React.createElement("frame")`) and automatic (`<frame />`) JSX both work; loom
configures the automatic runtime by default, so the `React` import is optional
in a file that only uses JSX.

Any other subpath is a compatibility boundary loom names rather than guesses at:

```text
[loom] The @rbxts/react subpath "@rbxts/react/internal" is not supported by
Loom's browser compatibility layer.

Supported entrypoints:
- @rbxts/react
- @rbxts/react/jsx-runtime
- @rbxts/react/jsx-dev-runtime
```

#### `@rbxts/react-roblox`

The root import is answered by loom's preview client, covering every value
upstream declares: `createRoot` (and its React 17 flavours `createBlockingRoot`
and `createLegacyRoot`, which map onto the same root because loom commits
synchronously either way), `createPortal`, `act`, `version`, and a root's
`render` / `unmount`. `RootOptions` is accepted and ignored — every field is
React-Lua hydration machinery with no browser meaning. Unsupported subpaths get
the same named diagnostic as above.

#### Intentional differences from React-Lua

| Upstream | Under loom |
| --- | --- |
| `ReactComponent` re-creates the class via `Component:extend` | identity — browser React already accepts the class |
| `createElement` lower-cases host tags and folds `Event`/`Change`/`Tag` into keyed props | `createElement` is browser React's own; the renderer reads those props directly |
| `React.None` removes a state key | throws a loom error (see above) |
| `React.Tag` reaches Studio's CollectionService | loom's own CollectionService: code-set tags only, no tag editor |
| React 17 semantics | React 18 — loom also exposes `act`, `startTransition`, `useId`, `useDeferredValue`, `useInsertionEffect`, `useSyncExternalStore`, `useTransition`, `version` and `createFactory`, which **roblox-ts will reject** when the same file is compiled for Roblox |
| `createMutableSource` / `useMutableSource`, `unstable_DebugTracingMode`, `unstable_LegacyHidden`, `unstable_parseReactError`, `__subscribeToBinding` | not exposed — React 17 experiments or React-Lua internals with no browser counterpart |

The runtime surface is derived from upstream rather than hand-listed: a contract
test parses `@rbxts/react`'s own `index.d.ts` with the TypeScript compiler API
and fails if a declared runtime export is missing, and every deliberate omission
carries a written reason. See `packages/preview/src/compat/react.contract.test.ts`.

### Built-in: `@rbxts/ui-labs`

The root import works with **no configuration at all** — no `shims` entry, no
local compatibility file:

```ts
import { Environment } from "@rbxts/ui-labs";
```

Loom models the **non-story** environment, which is exactly how UI Labs itself
behaves when the same code runs outside a story:

- `Environment.IsStory()` returns `false`.
- `Environment.InputListener` is `undefined` (it is story-only).
- `Environment.UserInput` is loom's `UserInputService` — the same object
  `game.GetService("UserInputService")` returns, never a copy.
- `Unmount`, `Reload`, `CreateSnapshot` and `SetStoryHolder` are no-ops, and
  `GetJanitor()` returns `undefined`, so ordinary cleanup code doesn't fail.

So the usual reusable-input guard picks loom's own service, with nothing to
configure:

```ts
import { Environment } from "@rbxts/ui-labs";
import { UserInputService } from "@rbxts/services";

export const InputService = Environment.IsStory()
  ? Environment.InputListener
  : UserInputService;
```

This is compatibility for that one import, **not** support for UI Labs. Loom is
not the Studio plugin and a loom scene is not a story, so story creators
(`CreateReactStory` and friends), controls, snapshots, sandbox injection, story
mounting, hot-reload internals and the plugin APIs are not emulated — importing
one fails with the normal ESM missing-export error, which is far better than a
stub that behaves differently than it does in Studio. Subpaths
(`@rbxts/ui-labs/controls`) are not covered either.

To replace loom's implementation with your own, declare a shim: user shims are
matched first.

```ts
loomPreview({
  shims: { "@rbxts/ui-labs": "./loom-shims/ui-labs.ts" },
})
```

### Built-in: `@rbxts/ripple` and `@rbxts/react-ripple`

Both root imports work with **no configuration**:

```tsx
import { config, useSpring } from "@rbxts/react-ripple";

function AnimatedButton() {
  const [offset, spring] = useSpring(0, config.stiff);

  return (
    <textbutton
      Size={offset.map((value) => UDim2.fromOffset(200 + value, 50 + value))}
      Event={{
        MouseEnter: () => spring.setGoal(10),
        MouseLeave: () => spring.setGoal(0),
      }}
    />
  );
}
```

Ripple publishes a Luau runtime and a `.d.ts` (`"main": "src/init.luau"`) — no
browser-executable code — so loom answers both packages with a **port** of the
published implementation, not a stub. The spring integrator, the easing curves,
the Oklab colour interpolation and the rest thresholds all follow the Luau
source, so a component animates the same way it does in Roblox.

Animation runs on loom's own frame loop: controllers connect to
`RunService.Heartbeat` — one listener shared by every spring, tween and motion,
released the moment the last one settles — and push values into a React
*binding*, which the renderer writes straight onto the live instance. A 60fps
animation is 60 property writes and **zero** React renders.

**Supported exports.** `createSpring`, `createTween`, `createMotion`, `config`,
`easing`, `springScheduler`, `tweenScheduler`, `motionScheduler`, and the
`useSpring` / `useTween` / `useMotion` hooks (which also re-export the core, as
the real package does). Every published `config` preset and every published
`easing` curve is implemented.

**Supported controller methods**, matching the published `.d.ts`:

| | methods |
| --- | --- |
| all three | `getPosition` `getGoal` `setPosition` `setGoal` `onChange` `onComplete` `step` `idle` `configure` `start` `stop` `destroy` |
| `Spring` / `Motion` | `getVelocity` `setVelocity` |
| `Spring` | `impulse` `halt` |
| `Tween` | `getFrom` `setFrom` |
| `Motion` | `spring` `tween` |

Every documented option is honoured: `start`, `tension`, `friction`, `mass`,
`dampingRatio`, `frequency`, `precision`, `restVelocity`, `position`,
`velocity`, `impulse` (spring); `start`, `easing`, `duration`, `repeats`,
`reverses`, `position` (tween); `start`, `spring`, `tween` (motion).

**Supported values.** `number`, `Vector2`, `Vector3`, `Color3`, `UDim`,
`UDim2`, `Rect`, and records of numbers (which accept partial goals — keys you
leave out don't move). `Color3` interpolates through Oklab, and `UDim`/`UDim2`
offsets round to integers, both as Roblox does.

**Not supported.** `CFrame` throws rather than animating:

```text
[loom] Ripple compatibility does not yet support animating CFrame
```

loom's `CFrame` carries position only and the Scene IR has no property slot for
one, so an interpolation could not reach the screen. Anything else — a string,
a record of non-numbers — throws by name too, instead of freezing or producing
a corrupt value. Subpaths (`@rbxts/ripple/foo`) are not covered.

Two deliberate differences from upstream, both in loom's favour:

- `destroy()` also drops the controller's `onChange` / `onComplete` callbacks
  (upstream only stops it), so a torn-down controller can't call into an
  unmounted component.
- The hooks ignore a changed `initialOptions` after mount, exactly as upstream
  does — recreating a controller mid-animation would drop its velocity and its
  subscribers. Call `controller.configure(...)` to retune one in place.

Bindings themselves are part of the React adapter, not this shim:
`createBinding`, `useBinding` and `joinBindings` are exported from
`@rbxts/react`, and any host prop accepts a plain value or a `Binding` of one.

To replace loom's implementation with your own, declare a shim — user shims win:

```ts
loomPreview({
  shims: { "@rbxts/react-ripple": "./loom-shims/react-ripple.ts" },
})
```

### `shims`

For any other package loom can't run, point the specifier at a browser module
you write:

```ts
// vite.config.ts
loomPreview({
  shims: { "@rbxts/example": "./loom-shims/example.ts" },
})
```

Targets are absolute paths, paths relative to the project root, or bare package
ids. Matching is **exact** — `@rbxts/example` does not capture
`@rbxts/example/controls`, which keeps a partial shim from silently answering
for a subpath it was never written for. List the subpath separately when you
mean to cover it. Shims are matched before every one of loom's own aliases, so
they can also override the built-in `@rbxts/*` ones — including the built-in
compatibility above.

The same option exists on every entry path, since they all share one Vite
config: `loom.config.ts` (`loom preview` / `loom build`), `createGalleryServer`
and `buildGallery` in `loom-dev/embed`, and `withLoomGallery()` in
`loom-dev/next`.

```ts
// loom.config.ts — for the CLI
export default {
  targets: "src/scenes",
  shims: { "@rbxts/example": "./loom-shims/example.ts" },
};
```

### Writing a shim

Model what the package means *here*, and only the slice your code uses. Import
loom's own modules the way app code does — `@rbxts/services` is aliased to
loom's service singletons, so a shim that re-exports one hands back the same
object `game.GetService(...)` returns. Never construct a second service.

```ts
// loom-shims/example.ts
import { UserInputService } from "@rbxts/services";

export const listener = UserInputService;
```

Leaving the rest out is the point: an import of something you didn't shim fails
with the normal ESM missing-export error, which beats a stub that behaves
differently than it does in Studio.

A package loom can't run and you haven't shimmed says so directly:

```text
[loom] Package "@rbxts/example" only provides a Lua/Luau runtime
("src/init.lua") and cannot run in the browser.
Imported by /project/src/app.ts

Provide a browser-compatible replacement with:

loomPreview({
  shims: {
    "@rbxts/example": "./loom-shims/example.ts",
  },
});
```

That message replaces what you would otherwise get: Vite's opaque `Failed to
resolve entry for package`, or — worse, and only during `vite build` — Rollup
trying to *parse* the Luau as JavaScript:

```text
RollupError:
../node_modules/@rbxts/example/src/init.luau (1:6):
Expected ';', '}' or <eof>
```

Both mean the same thing: the package's npm runtime is `.lua`/`.luau`, so loom
needs a **browser runtime adapter** for it — either one loom ships (the
built-ins above) or one you supply through `shims`. Nothing can be inferred
automatically; Luau is not JavaScript, and a `.d.ts` is types rather than code.

Worth knowing: this can surface *only* in the static build. A gallery target is
a lazy `import()`, so the dev server never fetches a scene you don't open, while
`loom build` (and `next build`) follows every target eagerly to code-split it.
A gallery that runs fine in development can still fail the build — which is why
loom applies the same aliases and the same resolver in both modes.

## Layout

- `crates/` — Rust workspace
  - `loom-scene` — Scene IR types + schema (single source of truth)
  - `loom-layout` — the layout engine
  - `loom-layout-wasm` — `wasm-bindgen` wrapper around `loom-layout`
- `packages/` — TypeScript workspace (`@loom-dev/*`)
  - `@loom-dev/scene` — Scene IR types (mirrors `loom-scene`)
  - `@loom-dev/layout` — thin JS binding over the WASM layout engine
  - `@loom-dev/runtime` — Roblox datatypes, Instance model, signals, services,
    scheduler, and Luau globals
  - `@loom-dev/renderer` — Scene IR → DOM, plus an incremental patching session
    with pointer/keyboard input delegation
  - `@loom-dev/react` — `@rbxts/react` adapter (custom `react-reconciler` host
    config driving live loom instances)
  - `@loom-dev/vide` — `vide` signals adapter on the same Scene IR
  - `@loom-dev/preview` — zero-config Vite plugin (generated page, entry
    detection, gallery mode), browser roblox-ts resolver, globals, and client
  - `loom-dev` — the `loom` CLI (`preview` / `build`)
- `apps/` — dev harnesses: `playground`, `example`, `interactive`,
  `gallery-demo`, `vide-example`

## Toolchain

- Node.js 24+, pnpm 11
- Rust (rustup) with the `wasm32-unknown-unknown` target, `wasm-pack`

> On macOS with Homebrew Rust installed, the rustup toolchain must be used for
> WASM builds (Homebrew's `rustc` ships no `wasm32` std). WASM build scripts
> prepend `~/.cargo/bin` to `PATH` for this reason.

## Commands

- `pnpm install` — install deps (runs `build:native`)
- `pnpm build:native` — build the WASM layout engine (`scripts/build-wasm.sh`)
- `cargo build` — build the Rust workspace
- `pnpm typecheck` / `pnpm build`
- `pnpm test` — `cargo test` + `vitest run`
- `pnpm test:packed` — packs the tarballs, installs them into a throwaway
  external Next.js app and runs `next build` against it. Slow (it installs
  Next from the network) and deliberately outside `pnpm test`, but it is the
  only check that covers the *published* layout — `files`, tarball contents,
  and loom's React winning over a host app's
- `pnpm lint` / `pnpm format` — Biome
- `pnpm changeset` — record a release note for the packages you touched

## Releasing

Everything under `packages/` is published to npm under the `@loom-dev` scope
(the CLI keeps the unscoped name `loom-dev`), and all of them move in lockstep —
one version bump bumps them all.

The workspace itself stays source-first: `exports` point at `src/`, so a
checkout needs no build step and edits are picked up immediately. `dist/` is
swapped in only for the published tarball, via `publishConfig`.

Versioning is done locally and CI only publishes. (There used to be a workflow
that kept a "Version Packages" PR in sync; it needed GitHub Actions to be
allowed to open pull requests, which this repo does not permit, so it never
worked and is gone.)

1. Add a changeset to your PR: `pnpm changeset`.
2. When you want to cut a release, apply the pending changesets locally:
   `pnpm version-packages`. That bumps every package to the same version and
   writes the changelogs. It needs `GITHUB_TOKEN` in the environment — the
   changelog generator links commits and authors — e.g.
   `GITHUB_TOKEN=$(gh auth token) pnpm version-packages`.
3. Commit the result and push it to `main`.
   [`publish.yaml`](.github/workflows/publish.yaml) runs on every push and ships
   whatever the registry does not have yet: release-profile WASM, then the JS,
   then `pnpm publish:packages` (`pnpm -r publish` over `packages/*`, which
   skips versions npm already has). A push with no version change is a cheap
   no-op, and `pnpm publish:packages` is the same command you would run by hand.

   Changesets is used for changelogs and version bumps only, never to publish:
   `changeset publish` reports registry rejections as a bare `E404 undefined`
   per package, which hides npm's actual error.
4. Optionally push a `v<version>` tag to cut a GitHub Release;
   [`tag-release.yml`](.github/workflows/tag-release.yml) attaches the npm
   tarballs and the WASM bundle to it.

### Trusted publishing (OIDC)

There is no `NPM_TOKEN`. Publishing authenticates with npm's trusted publishing:
the job mints a GitHub OIDC token (`id-token: write`), pnpm exchanges it for a
short-lived publish token, and npm attaches a provenance attestation
automatically. Two constraints follow from that:

- **The workflow filename is part of the trust config, extension included.**
  Each package's trusted publisher on npmjs.com names `publish.yaml`. Renaming
  the file — or moving the publish step into another workflow — breaks
  publishing until the publisher is updated. A mismatch is not reported as a
  permission error: the token exchange 404s, pnpm logs `Skipped OIDC` and
  carries on unauthenticated, and every package then fails its PUT with `E404`.
- **npm cannot configure a trusted publisher for a package that does not exist
  yet.** Every new `@loom-dev/*` package needs one bootstrap publish from a
  local `npm publish` (or a `0.0.0` placeholder) before its trusted publisher
  can be added.

Requires pnpm 11.6+ (it performs the OIDC exchange itself) and Node 22.14+.

## Roadmap

- **M0** — workspace skeleton ✅
- **M1** — vertical slice: Scene IR + WASM layout + DOM renderer ✅
- **M2** — Roblox runtime datatypes + `@rbxts/react` adapter ✅
- **M3** — layout completeness ✅ list/grid/padding/constraints/automatic size/
  text/flex (`HorizontalFlex`/`VerticalFlex`, `UIFlexItem`);
  `UIPageLayout` / `UITableLayout` are recognized but not implemented
- **M4** — visual fidelity — text (both the legacy `Font` enum and the modern
  `FontFace`), corners, strokes, gradients, clipping, transparency, rotation,
  and scrolling frames done; **images pending**
- **M5** — dev loop ✅ (Vite plugin, HMR, `loom preview`, `loom build`);
  a standalone roblox-ts compiler transform is still open
- **M6** — extensibility proof — `vide` adapter shipped on the same Scene IR;
  a Luau adapter is still open
