/**
 * `resolver.ts` — the `.luau`-main fallback.
 *
 * roblox-ts packages point `"main"` at compiled Luau (`out/init.luau`), which
 * the browser can't run. When a bare import resolves to a `.luau`/`.lua` file,
 * the preview retries the package's TypeScript source at `src/index.ts(x)` —
 * the same convention lattice's own vitest aliases rely on. The path walk is a
 * pure function over an injected fs so it can be unit-tested without fixtures.
 */
import { dirname, join } from "node:path";

/** The bit of `node:fs` the resolver needs (injectable for tests). */
export interface ResolverFs {
	isFile(path: string): boolean;
}

const LUAU_ID_RE = /\.luau?$/;

/** Whether a resolved module id (query/hash stripped) is a Luau file. */
export function isLuauId(id: string): boolean {
	const clean = id.split("?")[0]?.split("#")[0] ?? id;
	return LUAU_ID_RE.test(clean);
}

/**
 * Given a resolution that landed on a `.luau`/`.lua` file, find the nearest
 * `package.json` above it (the package whose `"main"` produced the hit) and
 * return that package's `src/index.ts` (or `src/index.tsx`) when it exists.
 * Returns `undefined` when the id isn't Luau or no source entry is found.
 */
export function resolveLuauFallback(
	resolvedId: string,
	fs: ResolverFs,
): string | undefined {
	if (!isLuauId(resolvedId)) return undefined;
	const clean = resolvedId.split("?")[0]?.split("#")[0] ?? resolvedId;
	let dir = dirname(clean);
	for (let i = 0; i < 24; i++) {
		if (fs.isFile(join(dir, "package.json"))) {
			for (const candidate of ["src/index.ts", "src/index.tsx"]) {
				const source = join(dir, candidate);
				if (fs.isFile(source)) return source;
			}
			return undefined;
		}
		const parent = dirname(dir);
		if (parent === dir) return undefined;
		dir = parent;
	}
	return undefined;
}
