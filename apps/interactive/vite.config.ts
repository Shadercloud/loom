import { loomPreview } from "@loom-dev/preview/vite";
import { defineConfig } from "vite";

// The whole config. No index.html, no entry wiring, no aliases: loomPreview()
// generates the page around `src/main.client.tsx`, aliases @rbxts/* to the loom
// adapters, and installs the Roblox globals — `vite` and `vite build` both work
// from here, exactly like `loom preview` does with no config at all.
export default defineConfig({
	plugins: [loomPreview()],
});
