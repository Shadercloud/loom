#!/usr/bin/env bash
set -euo pipefail

# Homebrew's rustc ships no wasm32 std on this machine, and it sits ahead of
# rustup in PATH. Force the rustup toolchain (which has wasm32-unknown-unknown).
export PATH="$HOME/.cargo/bin:$PATH"

crate_dir="crates/loom-layout-wasm"
# --out-dir is relative to the crate dir; emit into the @loom-dev/layout package.
out_dir="../../packages/layout/pkg"

# --dev keeps builds fast and skips wasm-opt; switch to release for shipping.
wasm-pack build "$crate_dir" \
	--dev \
	--target web \
	--out-dir "$out_dir" \
	--out-name loom_layout_wasm

echo "wasm built → packages/layout/pkg"
