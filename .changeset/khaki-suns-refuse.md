---
"@loom-dev/preview": patch
"loom-dev": patch
---

Let an embedded preview take a specific backdrop colour, not just one of the two themes.

- **`?background=<css color>` paints the stage.** `?theme=light|dark` picks a whole palette (chrome, text, and one of loom's two backdrops, `#14161a` or `#f6f9fc`); `background` overrides just the backdrop with a colour of your own and leaves the rest to the theme, so a plain white stage is `?theme=light&background=white`. `transparent` lets the host page show through the iframe. It applies in both gallery modes and to the static build, on the same URL contract as the rest.
- **Hex without the `#`.** A literal `?background=#ffffff` never reaches the gallery — `#` opens the URL fragment, which is also where the gallery keeps its route. Both spellings that survive are accepted: percent-encoded (`%23ffffff`) and bare digits (`ffffff`).
- **`{ type: "loom-background", background }` re-points it live**, next to the existing `{ type: "loom-theme" }` message, so a docs page that switches theme at runtime need not reload the iframe. Posting the message with no colour hands the backdrop back to the theme.
- Only colours are accepted, through an allowlist: a gradient, a `url(...)`, or anything else that could turn a query param into a network fetch is ignored, and the theme's own backdrop stands.
