# Loom

Render Roblox UI as a live web DOM preview.

Loom takes a Roblox GUI tree — produced from `@rbxts/react` today, and from
`vide` / Luau later — and renders it in the browser with Roblox-accurate layout.
The pipeline is built around a single framework-agnostic contract, the **Scene
IR**, so any frontend can plug into the same layout + rendering core.

```
 @rbxts/react ─┐
   vide        ├─►  Frontend Adapter  ─►  Scene IR  ─►  Layout Engine  ─►  DOM Renderer  ─►  Browser DOM
   luau        ┘       (TS, swappable)     (contract)    (Rust → WASM/native)   (TS)
```

## Layout

- `crates/` — Rust workspace
  - `loom-scene` — Scene IR types + schema (single source of truth)
  - _(M1+)_ `loom-layout`, `loom-layout-wasm`, `loom-layout-napi`, `loom-compiler`
- `packages/` — TypeScript workspace (`@loom-dev/*`)
  - `@loom-dev/scene` — Scene IR types (mirrors `loom-scene`)
  - _(M1+)_ `@loom-dev/runtime`, `@loom-dev/renderer`, `@loom-dev/react`, `@loom-dev/preview`, `@loom-dev/cli`
- `apps/` — dev harnesses

## Toolchain

- Node.js 24+, pnpm 11
- Rust (rustup) with the `wasm32-unknown-unknown` target, `wasm-pack`

> On macOS with Homebrew Rust installed, the rustup toolchain must be used for
> WASM builds (Homebrew's `rustc` ships no `wasm32` std). WASM build scripts
> prepend `~/.cargo/bin` to `PATH` for this reason.

## Commands

- `pnpm install`
- `cargo build`
- `pnpm typecheck`
- `pnpm build`
- `pnpm test`

## Roadmap

- **M0** — workspace skeleton ✅
- **M1** — vertical slice: Scene IR + minimal WASM layout + DOM renderer
- **M2** — Roblox runtime datatypes + `@rbxts/react` adapter
- **M3** — layout completeness (list/grid/padding/constraints/automatic size/text)
- **M4** — visual fidelity (text, images, corners, strokes, gradients, clipping)
- **M5** — compiler (roblox-ts transform) + dev loop (Vite plugin, HMR, CLI)
- **M6** — extensibility proof (`vide` / Luau adapter on the same Scene IR)
