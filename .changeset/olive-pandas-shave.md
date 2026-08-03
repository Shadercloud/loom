---
"@loom-dev/renderer": minor
"@loom-dev/runtime": minor
"@loom-dev/preview": minor
---

Load the engine's fonts in the preview, and know the rest of them by name
(reported in #11).

**The preview now loads the faces.** `@loom-dev/renderer/fonts` has shipped real
font files since 0.7.0 — Fontsource `woff2` in the bundle, no CDN and nothing
installed on the machine — but it was an opt-in import and the preview never
made it, so out of the box every Roblox family fell through to `system-ui`: SF
Pro on macOS, Segoe UI on Windows, Roboto on Linux. `AutomaticSize` and
`TextWrapped` are driven by *measuring* the face, so the same scene laid out
differently on each. The import now sits in the globals module, which is
injected ahead of the app entry whichever frontend it uses, so a vide preview
gets the same faces as a react one.

**And it covers the list now, not four of it.** `SourceSans`, `Roboto`,
`RobotoMono` and `Inconsolata` were the only families with a face; every other
name loom did not recognise resolved to the generic sans stack *silently*, since
the missing-face warning only fires for families it knows about. Twenty-eight
families now register a real face — Jura, Merriweather, Nunito, Oswald, Ubuntu,
TitilliumWeb, JosefinSans, GrenzeGotisch, RobotoCondensed, Arimo, Sarpanch,
Michroma, AmaticSC, Bangers, Creepster, DenkOne, Fondamento, FredokaOne,
IndieFlower, Kalam, LuckiestGuy, PatrickHand, PermanentMarker and SpecialElite
alongside the original four. All OFL-1.1 bar Ubuntu, which is under the Ubuntu
Font Licence.

The rest of the engine's list is at least *named* now, so it resolves to a stack
that leads with the right typeface and warns instead of drifting in silence:
`Gotham` and `BuilderSans` (proprietary), `Bodoni`, `Garamond`, `Cartoon`,
`SciFi`, `Arcade`, `Fantasy`, `Antique`, `Highway`. `Arial` and `Legacy` need
nothing — Arimo is metric-compatible with Arial and is now in their stack.

**`Enum.Font` is the engine's whole enum**, all 53 items in its own order,
instead of the sixteen loom happened to paint. `Enum.Font.Jura` was `undefined`
in a preview, so a scene that named it crashed before it drew anything, and
`Font.fromEnum` sent every unrecognised item to `SourceSansPro`; it now resolves
each item's own family.

`FredokaOne` is the one approximation: Google folded "Fredoka One" into
Fredoka's heavier weights, so Fredoka is what registers for it.

Sizes, since this is a font shipment: a static gallery build emits ~2.8 MB of
`woff2` across the whole set. What a *page* downloads is unchanged — Fontsource
declares per-script `unicode-range` subsets, so a browser fetches only the
families and scripts a scene actually paints with.
