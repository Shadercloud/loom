#!/usr/bin/env bash
set -euo pipefail

# Homebrew's rustc ships no wasm32 std on this machine, and it sits ahead of
# rustup in PATH. Force the rustup toolchain (which has wasm32-unknown-unknown).
export PATH="$HOME/.cargo/bin:$PATH"

crate_dir="crates/loom-layout-wasm"
# --out-dir is relative to the crate dir; emit into the @loom-dev/layout package.
out_dir="../../packages/layout/pkg"

# --dev keeps builds fast and skips wasm-opt; releases run wasm-opt and ship the
# smaller binary. LOOM_WASM_PROFILE=release is what the release workflow sets.
profile="${LOOM_WASM_PROFILE:-dev}"

wasm-pack build "$crate_dir" \
	"--$profile" \
	--target web \
	--out-dir "$out_dir" \
	--out-name loom_layout_wasm

# wasm-pack writes its own package.json into out-dir; it would otherwise be
# picked up as a nested package and confuse `pnpm publish` on @loom-dev/layout.
rm -f "$crate_dir/$out_dir/package.json" "$crate_dir/$out_dir/.gitignore" "$crate_dir/$out_dir/README.md"

echo "wasm built ($profile) → packages/layout/pkg"
