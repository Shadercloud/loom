/**
 * The deployment prefix this site is served under — Next's `basePath`.
 *
 * Loom generates its gallery assets for `<basePath>/loom-preview/`
 * automatically, but a **literal** `src` in MDX is just a string: it never
 * passes through `next/link` or Next's router, so nothing prefixes it. Keeping
 * the prefix in one constant is what stops the local and deployed URLs from
 * drifting apart.
 */
export const siteBasePath = process.env.LOOM_DEMO_BASE_PATH ?? '';

/** A deep link into the loom gallery, correct under any `basePath`. */
export function loomPreviewUrl(target: string): string {
  return `${siteBasePath}/loom-preview/?chrome=none&target=${target}`;
}
