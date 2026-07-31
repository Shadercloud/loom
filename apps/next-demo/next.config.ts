import { withLoomGallery } from "loom-dev/next";

// The `loom-dev/next` harness: a plain Next.js app (react-dom on the pages
// router — nothing loom about it) that serves the gallery-demo targets under
// /loom-preview. `next dev` boots the isolated gallery Vite server and
// proxies to it; `next build` only injects the static-gallery rewrite.
export default withLoomGallery(
	{ reactStrictMode: true },
	{ root: "../gallery-demo", targets: "src/targets" },
);
