import { loomBuild } from "../../tsdown.base.ts";

// `./fonts` is a second entry, not part of the main bundle: importing it is how
// a project opts into shipping the font files, and everyone else pays nothing.
export default loomBuild({ entry: ["src/index.ts", "src/open-fonts.ts"] });
