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

Options: `base` (default `/loom-preview/`), `port`, `hmrPort`, `staticBuild`.
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
  text; `UIPageLayout` / `UITableLayout` are recognized but not implemented
- **M4** — visual fidelity — text, corners, strokes, gradients, clipping,
  transparency, rotation, and scrolling frames done; **images pending**
- **M5** — dev loop ✅ (Vite plugin, HMR, `loom preview`, `loom build`);
  a standalone roblox-ts compiler transform is still open
- **M6** — extensibility proof — `vide` adapter shipped on the same Scene IR;
  a Luau adapter is still open
