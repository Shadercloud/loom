import { loomBuild } from "../../tsdown.base.ts";

export default loomBuild({
	// react-reconciler is CJS; leave the interop to the consumer's bundler.
	deps: { neverBundle: ["react", "react-reconciler", /^react-reconciler\//] },
});
