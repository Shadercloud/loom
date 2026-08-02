---
"@loom-dev/runtime": minor
"@loom-dev/preview": minor
---

Add the Luau `table` library to the globals a previewed roblox-ts tree runs
against — `insert`, `remove`, `find`, `concat`, `sort`, `create`, `clear`,
`clone`, `freeze`, `isfrozen`, `pack`, `unpack` and `move`, over arrays, `Map`s,
`Set`s and plain objects, plus the deprecated `getn`, `maxn`, `foreach` and
`foreachi` that Roblox still exposes and old code still calls. It was the last
of the standard libraries `luau.ts` left out, and the one UI code reaches for
most: a component that built its rows with `table.insert` crashed on `table is
not defined` before it ever rendered.

Positions are **1-based**, like the engine's. `table` is not a roblox-ts macro —
the compiler passes its arguments straight through to Luau, so the number
written in the source is already a Luau index, exactly as it is for the
`string.find` already shipped here. The array *methods* roblox-ts does compile
as macros keep their 0-based TS indices, so `list.remove(0)` and
`table.remove(list, 1)` drop the same element.

`sort` takes Luau's boolean predicate (`comp(a, b)` is true when `a` comes
first), not a JS comparator returning a number.

Where the engine raises an error, loom leans forgiving instead, so a preview
renders rather than dying over an off-by-one: an out-of-range `insert` position
clamps, an out-of-range `remove` returns `nil` without mutating, and `concat`
stringifies whatever it is handed. `freeze` is `Object.freeze`, which covers
arrays and objects but cannot stop `Map.set`.

**And with it, the rest of the Luau standard library**, so a roblox-ts tree no
longer trips over a missing global halfway through a render:

- `string` gains `match`, `gmatch`, `byte`, `char`, `len` and `reverse`, and
  `find` now takes a negative `init` the way the engine does. `match`/`gmatch`
  return captures as the tuple roblox-ts reads, empty when unmatched, like
  `find`. The prototype patches pick up `gmatch`, `byte`, `len` and `reverse` —
  but deliberately not `match`, which JS already defines with other semantics on
  a prototype the whole page shares.
- `math` gains `asin`, `acos`, `atan`, `atan2`, `sinh`, `cosh`, `tanh`, `log10`,
  `ldexp`, `frexp`, `modf` and `randomseed`, and `log` now takes an optional
  base. `randomseed` genuinely seeds: `Math.random` cannot be, so it switches
  `math.random` to a deterministic generator rather than silently ignoring code
  that seeds for reproducibility.
- `os` gains `date` (a strftime subset, `*t` tables and the `!` UTC prefix) and
  `difftime`, and `time` now accepts a date table.
- New libraries: `bit32` (Luau's saturating shifts, not JS's masked ones),
  `utf8`, `debug` (profiling wired to `performance.measure`, so Roblox
  instrumentation shows up in the devtools Performance panel) and `buffer`
  (little-endian and bounds-checked; `typeOf` answers `"buffer"`).
- New globals: `select`, the deprecated `unpack`, and `rawget` / `rawset` /
  `rawequal` / `rawlen`.

Still absent, on purpose: `setmetatable`/`getmetatable`/`newproxy`. Loom runs
the author's TypeScript, whose classes are JS classes, and there is no faithful
way to give a plain object a metatable's `__index` behaviour without proxying
every table in the program.
