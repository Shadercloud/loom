import { loomBuild } from "../../tsdown.base.ts";

export default loomBuild({
	// `cli.ts` is the executable; `embed.ts` and `next.ts` are the importable
	// surfaces hosts use to mount the gallery on their own dev server / build
	// (`loom-dev/embed`, `loom-dev/next`), so types are emitted — `cli.d.ts`
	// just comes along for the ride.
	entry: ["src/cli.ts", "src/embed.ts", "src/next.ts"],
	deps: { neverBundle: ["vite", "react", /^react\//] },
});
