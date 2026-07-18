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
	/** Read a file's text, or `undefined` if it can't be read. */
	readFile?(path: string): string | undefined;
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

/** The package root of a bare specifier (`@scope/name/sub` → `@scope/name`). */
function packageRootOf(specifier: string): string {
	const parts = specifier.split("/");
	return specifier.startsWith("@")
		? parts.slice(0, 2).join("/")
		: (parts[0] ?? specifier);
}

/**
 * Resolve a bare roblox-ts package specifier straight to its TypeScript source
 * WITHOUT requiring the compiled `.luau` main to exist. Walks up from the
 * importer to find `node_modules/<pkg>/package.json`; if that package's `"main"`
 * targets Luau, returns its `src/index.ts(x)`.
 *
 * {@link resolveLuauFallback} only fires once Vite resolves the `.luau` main —
 * which fails when the package was never compiled (`out/` absent). This runs
 * before resolution instead, so loom can consume a roblox-ts workspace from
 * source with no build step. Returns `undefined` for non-Luau packages so
 * normal resolution proceeds.
 */
export function resolvePackageSource(
	specifier: string,
	importer: string,
	fs: ResolverFs,
): string | undefined {
	if (!fs.readFile) return undefined;
	const pkgName = packageRootOf(specifier);
	let dir = dirname(importer);
	for (let i = 0; i < 40; i++) {
		const pkgDir = join(dir, "node_modules", pkgName);
		const pkgJson = join(pkgDir, "package.json");
		if (fs.isFile(pkgJson)) {
			const raw = fs.readFile(pkgJson);
			if (raw !== undefined) {
				try {
					const main = (JSON.parse(raw) as { main?: unknown }).main;
					if (typeof main === "string" && isLuauId(main)) {
						for (const candidate of ["src/index.ts", "src/index.tsx"]) {
							const source = join(pkgDir, candidate);
							if (fs.isFile(source)) return source;
						}
					}
				} catch {
					// Malformed package.json — let normal resolution report it.
				}
			}
			return undefined; // package found, but not a Luau-main package
		}
		const parent = dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return undefined;
}
