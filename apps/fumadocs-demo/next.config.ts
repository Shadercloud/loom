import { createMDX } from 'fumadocs-mdx/next';
import { withLoomGallery } from 'loom-dev/next';
import { NextConfig } from 'next';

const withMDX = createMDX();

const config: NextConfig = {
  reactStrictMode: true,
};

// loom outermost: it accepts withMDX's output (object or function) and
// returns the phase-aware function config Next needs.
export default withLoomGallery(withMDX(config), {
  root: '../gallery-demo',
  targets: 'src/targets',
});
