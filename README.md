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

```sh
pnpm install                  # also builds the WASM layout engine (prepare hook)
pnpm --filter @loom-dev/playground dev
```

To preview an existing roblox-ts UI project with no config:

```sh
loom preview [dir] [--port <n>] [--host] [--targets [glob]]
loom build   [dir] --targets [glob] [--out <dir>] [--base <path>]
```

`preview` boots a Vite dev server with the loom plugin pre-applied, generates an
`index.html` when the project has none, and auto-detects a client entry
(`src/main.client.tsx` and friends). `--targets` switches to **gallery mode**:
every `**/*.loom.tsx` under the directory gets a sidebar entry with lazy mounts
and per-target error containment. `build` bundles that same gallery into a
static, client-only site (default `dist-preview/`). Both read an optional
`<dir>/loom.config.ts` exporting `{ targets?, port? }`.

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
  - `@loom-dev/preview` — zero-config Vite plugin, browser roblox-ts resolver,
    globals, and client
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
   [`publish.yml`](.github/workflows/publish.yml) runs on every push and ships
   whatever the registry does not have yet: release-profile WASM, then the JS,
   then `changeset publish`. A push with no version change is a cheap no-op.
4. Optionally push a `v<version>` tag to cut a GitHub Release;
   [`tag-release.yml`](.github/workflows/tag-release.yml) attaches the npm
   tarballs and the WASM bundle to it.

### Trusted publishing (OIDC)

There is no `NPM_TOKEN`. Publishing authenticates with npm's trusted publishing:
the job mints a GitHub OIDC token (`id-token: write`), pnpm exchanges it for a
short-lived publish token, and npm attaches a provenance attestation
automatically. Two constraints follow from that:

- **The workflow filename is part of the trust config.** Each package's trusted
  publisher on npmjs.com names `publish.yml`. Renaming the file — or moving the
  publish step into another workflow — breaks publishing until the publisher is
  updated. This is why versioning and publishing are separate workflows.
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
