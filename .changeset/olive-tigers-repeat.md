---
"@loom-dev/runtime": patch
"@loom-dev/react": patch
---

Fix two class-registry gaps that made loom warn about — and in one case
mis-render — classes it already supports.

- `CollectionService` was missing from the runtime's `CLASS_PARENTS` table even
  though the service itself is fully implemented. Because `@rbxts/react`'s `Tag`
  prop resolves the service on every tagged mount, the first tagged component in
  a preview logged `[loom] unknown class "CollectionService" — treating it as a
  direct Instance subclass`. The service is registered now, so tagged trees mount
  silently and `IsA("CollectionService")` answers correctly.
- The React adapter's intrinsic → class-name map omitted `uipagelayout`,
  `uitablelayout` and `uitextsizeconstraint`, so the fallback casing minted
  `Uipagelayout`. An unknown class participates in layout, which meant these
  modifiers were laid out and painted as plain grey boxes on top of the UI they
  were meant to modify. Mapped to their real casing they join the non-layout
  modifier set and render as nothing — loom still implements none of their
  behavior, but an app that uses one no longer gets a stray box.
