import { loomPreview } from "@loom-dev/preview/vite";
import { defineConfig } from "vite";

export default defineConfig({
	// loomPreview is self-sufficient: it aliases @rbxts/react(-roblox) to the loom
	// runtime, injects the Roblox globals, sets the automatic JSX runtime, and the
	// optimizeDeps include/exclude — so a roblox-ts source tree runs unmodified.
	plugins: [loomPreview()],
	server: {
		port: 5173,
		strictPort: true,
		fs: {
			// Allow importing the generated wasm pkg from the repo root.
			allow: ["../.."],
		},
	},
});
