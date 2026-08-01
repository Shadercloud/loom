---
"@loom-dev/layout": patch
"@loom-dev/react": patch
---

Make wrapped text and auto-sized rows measure the way Roblox does — a card whose body overflowed its own container, and a footer a whole button row too tall.

- **`TextWrapped` wraps at the nearest ancestor that has a width**, less the padding in between, instead of stopping at the immediate parent. A parent that is itself `AutomaticSize` was sized *by* the label, so wrapping against it is the same circle as wrapping against the label's own width and the text never wrapped at all. The library idiom stacks two or three such containers (a padded body inside a flex item inside a card), and the card — the one node with a real width — is where the room actually runs out. Text that used to run past its card and get painted over by the next one now wraps inside it.
- **A `Wraps` list measures as one run when the fill direction is the axis being measured.** `AutomaticSize` on that axis means there is no width yet to wrap against, so wrapping against the 0-wide measurement box put every item on its own line: a row of buttons measured one line per button, and the auto-sized footer holding them came out a row too tall while the paint — which runs against the real width — still laid them side by side. Same "unconstrained fill axis" rule `UIGridLayout` already followed.
- **`TextWrap` is declared on the text props.** It has been read as an alias of `TextWrapped` since 0.6.1, but only `TextWrapped` was on `TextGuiProps`, so a component written against the alias wrapped correctly at runtime and still failed to typecheck. `TextWrapped` continues to win when both are set.
