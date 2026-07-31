/**
 * `compat/aliases.ts` — the built-in compatibility registry.
 *
 * A handful of roblox-ts packages cannot run in the browser at all (Luau
 * runtime plus `.d.ts`, no TypeScript source) but *do* have a well-understood
 * meaning under loom. Rather than scattering package checks through the
 * resolver, each one gets an adapter module under `compat/` and one line here;
 * `vite.ts` turns the registry into `resolve.alias` entries.
 *
 * Two rules keep the registry safe to grow:
 *
 * - **Exact matches only.** `@rbxts/ui-labs` must not answer for
 *   `@rbxts/ui-labs/controls` (a subpath the adapter was never written for) or
 *   `@rbxts/ui-labs-extra` (a different package). Anything not covered keeps
 *   failing loudly, which is the correct outcome — see `../resolver.ts` for the
 *   diagnostic it fails with.
 * - **Below user shims.** These entries are emitted *after* the ones from
 *   `shims`, and Vite's alias plugin takes the first match, so a project can
 *   always replace loom's adapter with its own module. The two mechanisms are
 *   otherwise independent: nothing here knows about `shims`, and nothing in
 *   `shims` knows about this.
 */
import {
	REACT_RIPPLE_COMPAT_PATH,
	RIPPLE_COMPAT_PATH,
	UI_LABS_COMPAT_PATH,
} from "../paths.ts";

export interface BuiltInCompatibilityAlias {
	find: RegExp;
	replacement: string;
}

/**
 * A pattern matching one bare specifier and nothing else — no subpaths, no
 * longer package names — with every regex metacharacter in the specifier
 * escaped so `.` and friends match themselves.
 */
export function exactSpecifierPattern(specifier: string): RegExp {
	return new RegExp(`^${specifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
}

/** The registry itself: `[bare specifier, adapter module]`. */
const BUILT_IN_COMPATIBILITY: ReadonlyArray<readonly [string, string]> = [
	["@rbxts/ui-labs", UI_LABS_COMPAT_PATH],
	["@rbxts/ripple", RIPPLE_COMPAT_PATH],
	["@rbxts/react-ripple", REACT_RIPPLE_COMPAT_PATH],
];

/** The specifiers loom answers for out of the box (for docs and diagnostics). */
export const BUILT_IN_COMPATIBILITY_PACKAGES: readonly string[] =
	BUILT_IN_COMPATIBILITY.map(([specifier]) => specifier);

/** The registry as `resolve.alias` entries. */
export function builtInCompatibilityAliases(): BuiltInCompatibilityAlias[] {
	return BUILT_IN_COMPATIBILITY.map(([specifier, replacement]) => ({
		find: exactSpecifierPattern(specifier),
		replacement,
	}));
}
