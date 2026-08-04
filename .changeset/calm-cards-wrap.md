---
"@loom-dev/renderer": patch
"@loom-dev/react": patch
"@loom-dev/vide": patch
---

Measure text with the same quantized advances Roblox uses, and share that
measurement across the static renderer and both live adapters.

Browser canvas measurement shapes and kerns a whole run with fractional glyph
advances. Roblox spends each displayed grapheme on a half-pixel boundary, so
the browser answer can be a few percent narrower and wrap a long paragraph at
different words. The difference was especially visible in development, where
the React adapter measured `TextBounds` itself while a compiled scene used the
renderer path.

The renderer now caches half-pixel grapheme advances per font, invalidates them
when a face changes, and preserves the engine's fractional result instead of
rounding it to a whole pixel. React and Vide use the same measurement, keeping
development and static previews aligned for the long wrapped text reported in
[#11](https://github.com/astra-void/loom/issues/11).
