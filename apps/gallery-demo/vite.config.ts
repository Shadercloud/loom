import { loomPreview } from "@loom-dev/preview/vite";
import { defineConfig } from "vite";

// Gallery mode through the plugin alone: every `src/**/*.loom.tsx` gets a
// sidebar entry with a lazy mount and per-target error containment — the same
// thing `loom preview --targets` serves, and `vite build` emits it as a static
// site (what `loom build` does).
export default defineConfig({
	plugins: [loomPreview({ targets: "src/targets" })],
});
