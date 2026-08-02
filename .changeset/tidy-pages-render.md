---
"@loom-dev/scene": minor
"@loom-dev/layout": minor
"@loom-dev/runtime": minor
"@loom-dev/renderer": minor
"@loom-dev/react": minor
"@loom-dev/preview": minor
"@loom-dev/vide": minor
"loom-dev": minor
---

Close the five gaps loom kept documenting instead of implementing: the last two
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
*region* of the source. Tiling a sprite window is still not reproducible in CSS
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
