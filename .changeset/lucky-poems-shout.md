---
"@loom-dev/preview": patch
---

Fix `import ReactRoblox from "@rbxts/react-roblox"` failing with "does not provide an export named 'default'". The preview's stand-in now exports the namespace object too, matching upstream's `export =` typings and the `@rbxts/react` facade.
