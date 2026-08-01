/**
 * `transform.ts` — the roblox-ts source pre-transforms, applied to the previewed
 * project's own `.ts`/`.tsx` before esbuild sees them. Pure string→string, so
 * both are unit-testable without a Vite server.
 *
 * 1. `import X = require("m")` → an ESM namespace import.
 * 2. `.size()` / `.isEmpty()` → the symbol-keyed macro methods the runtime
 *    installs.
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

// `?.size()` keeps its optional link; `.size()` becomes a computed access, so
// the `?` is captured and re-emitted rather than replaced blind (`x.[k]()` is
// not valid JavaScript).
const LUAU_MACRO_RE = /(\?)?\.(size|isEmpty)\(\)/g;

/**
 * Rewrite the roblox-ts `.size()` / `.isEmpty()` macros to the symbol-keyed
 * methods `@loom-dev/runtime` installs on `Object.prototype`. Returns
 * `undefined` when the file calls neither, so callers can skip the rewrite.
 *
 * Why a source transform rather than a prototype patch: on `Array` and `String`
 * the runtime *can* add `size()` outright, because JS defines no such member.
 * On `Map` and `Set` it cannot — JS already has `size`, as a property, and one
 * name will not be both. A prototype patch is page-wide, so redefining it would
 * reach React's maps, Vite's, and loom's own scheduler (whose `dirty.size === 0`
 * drives the frame loop). Rewriting the *call site* puts roblox-ts semantics
 * exactly where roblox-ts code is and nowhere else.
 *
 * The receiver is never parsed — only the `.size()` suffix is replaced — so no
 * expression, however nested, can be mis-split. A `.size()` inside a string
 * literal would be rewritten too; that is the accepted cost of not parsing, and
 * the emitted call still resolves for any receiver that defines its own
 * `size()`, so a project's unrelated method keeps working either way.
 */
export function rewriteLuauMacros(code: string): string | undefined {
	// Fast path: most files call neither.
	if (!code.includes(".size()") && !code.includes(".isEmpty()")) {
		return undefined;
	}
	LUAU_MACRO_RE.lastIndex = 0;
	return code.replace(
		LUAU_MACRO_RE,
		(_match, optional: string | undefined, name: string) =>
			`${optional ? "?." : ""}[Symbol.for("loom.${name}")]()`,
	);
}
