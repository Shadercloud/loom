import { loomBuild } from "../../tsdown.base.ts";

export default loomBuild({
	entry: [
		"src/index.ts",
		"src/vite.ts",
		"src/client.ts",
		"src/globals.ts",
		"src/services.ts",
	],
	deps: {
		neverBundle: ["react", /^react\//, "vite"],
	},
});
