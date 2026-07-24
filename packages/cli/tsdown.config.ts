import { loomBuild } from "../../tsdown.base.ts";

export default loomBuild({
	// `cli.ts` is the executable; `embed.ts` is the importable surface hosts use
	// to mount the gallery on their own dev server / build (see `loom-dev/embed`),
	// so types are emitted — `cli.d.ts` just comes along for the ride.
	entry: ["src/cli.ts", "src/embed.ts"],
	// The gallery shell + its css are handed to Vite as source paths out of the
	// shipped `src/` (see `gallery-plugin.ts`), never bundled into the CLI.
	deps: { neverBundle: ["vite", "react", /^react\//, "virtual:loom-targets"] },
});
