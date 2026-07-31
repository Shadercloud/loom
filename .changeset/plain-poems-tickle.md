---
"@loom-dev/runtime": patch
"@loom-dev/preview": patch
"loom-dev": patch
---

Add browser-compatible `HttpService.GenerateGUID` support and implement
`Color3.fromHex`, allowing roblox-ts UI projects that generate component IDs and
define themes with hexadecimal colors to render in Loom unchanged.

```ts
import { HttpService } from "@rbxts/services";

const id = HttpService.GenerateGUID(false);
const accent = Color3.fromHex("#6366F1");
```

Both lines used to fail: the import with `The requested module
"@rbxts/services" does not provide an export named "HttpService"` (the alias
module exports an explicitly reviewed list, and loom had no `HttpService` to
put in it), the theme with `Color3.fromHex is not a function`.

- `HttpService` is now a real service instance in the runtime registry, so
  `game.GetService("HttpService")` and the `@rbxts/services` export are the same
  singleton. `GenerateGUID` returns an RFC 9562 v4 UUID from the Web Crypto API
  — `crypto.randomUUID()`, or `crypto.getRandomValues()` with the version and
  variant bits set explicitly — braced by default, and throws rather than
  falling back to a weak identifier when Web Crypto is unavailable.
  `JSONEncode` / `JSONDecode` come with it; `GetAsync`, `PostAsync` and
  `RequestAsync` throw by name, because a preview never issues requests on your
  behalf.
- `Color3.fromHex` accepts exactly six RGB hex digits, either case, with or
  without one leading `#`, and converts through the existing `Color3.fromRGB`
  path. CSS shorthand, alpha channels, `0x` notation and stray whitespace are
  rejected with a located loom error instead of being silently reinterpreted.
