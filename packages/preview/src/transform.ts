/**
 * `transform.ts` — the roblox-ts `import X = require("m")` pre-transform.
 *
 * roblox-ts sources (e.g. lattice's `core/src/react.ts`) use TypeScript
 * import-equals syntax, which esbuild lowers to a bare `require()` call that
 * breaks in the browser. Rewriting it to a namespace import *before* esbuild
 * runs keeps the module graph fully ESM. Pure string→string so it can be
 * unit-tested without a Vite server.
 */

// Anchored to (indented) line starts so `const x = require(...)` and
// `// import X = require(...)` comments never match. The quote is captured and
// backreferenced so mixed quotes inside the specifier can't false-positive.
const IMPORT_EQUALS_RE =
	/^([ \t]*)import\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*require\s*\(\s*(["'])([^"'\n]+)\3\s*\)\s*;?/gm;

/**
 * Rewrite every `import X = require("m");` statement to
 * `import * as X from "m";`. Returns the rewritten code, or `undefined` when
 * the file contains no import-equals statements (so callers can skip the
 * transform entirely). Idempotent: the rewritten form no longer matches.
 */
export function rewriteImportEquals(code: string): string | undefined {
	// Fast path: the vast majority of files never mention `require`.
	if (!code.includes("require")) return undefined;
	IMPORT_EQUALS_RE.lastIndex = 0;
	if (!IMPORT_EQUALS_RE.test(code)) return undefined;
	IMPORT_EQUALS_RE.lastIndex = 0;
	return code.replace(
		IMPORT_EQUALS_RE,
		(_match, indent: string, ident: string, quote: string, specifier: string) =>
			`${indent}import * as ${ident} from ${quote}${specifier}${quote};`,
	);
}
