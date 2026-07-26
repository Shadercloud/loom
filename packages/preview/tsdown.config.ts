import { loomBuild } from "../../tsdown.base.ts";

export default loomBuild({
	entry: [
		"src/index.ts",
		"src/vite.ts",
		"src/client.ts",
		"src/globals.ts",
		"src/services.ts",
		"src/gallery.ts",
	],
	// The gallery shell + its css are handed to Vite as source paths out of the
	// shipped `src/` (see `gallery-plugin.ts`), never bundled into dist.
	deps: {
		neverBundle: ["react", /^react\//, "vite", "virtual:loom-targets"],
	},
});
