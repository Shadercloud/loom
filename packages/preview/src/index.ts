/**
 * `@loom-dev/preview` — run a roblox-ts UI source tree in the browser.
 *
 * - `@loom-dev/preview/vite`    — the Vite plugin (`loomPreview()`)
 * - `@loom-dev/preview/client`  — the `@rbxts/react-roblox` stand-in (`createRoot`)
 * - `@loom-dev/preview/globals` — installs the Roblox datatype globals
 */

export type { LoomReactRoot } from "./client.ts";
export { createRoot } from "./client.ts";
export { loomPreview } from "./vite.ts";
