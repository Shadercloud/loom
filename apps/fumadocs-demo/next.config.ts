import { createMDX } from 'fumadocs-mdx/next';
import { withLoomGallery } from 'loom-dev/next';
import { NextConfig } from 'next';

const withMDX = createMDX();

// A deployment prefix, the way a GitHub Pages project site has one. Off by
// default; `LOOM_DEMO_BASE_PATH=/rbxts-react-clean-ui pnpm --filter
// @loom-dev/fumadocs-demo dev` runs the whole app — the loom gallery with it —
// below that path.
const basePath = process.env.LOOM_DEMO_BASE_PATH ?? '';

const config: NextConfig = {
  reactStrictMode: true,
  ...(basePath ? { basePath } : {}),
};

// loom outermost: it accepts withMDX's output (object or function) and
// returns the phase-aware function config Next needs. It reads `basePath` off
// the *resolved* config, so the gallery's assets are generated for
// `<basePath>/loom-preview/` while still being written to `public/loom-preview`.
export default withLoomGallery(withMDX(config), {
  root: '../gallery-demo',
  targets: 'src/targets',
});
