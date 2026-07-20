import { loomBuild } from "../../tsdown.base.ts";

export default loomBuild({
	entry: ["src/cli.ts"],
	// The CLI is an executable, not an importable surface — no types to emit.
	dts: false,
	// The gallery shell + its css are handed to Vite as source paths out of the
	// shipped `src/` (see `gallery-plugin.ts`), never bundled into the CLI.
	deps: { neverBundle: ["vite", "react", /^react\//, "virtual:loom-targets"] },
});
