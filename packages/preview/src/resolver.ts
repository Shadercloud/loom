/**
 * `resolver.ts` — the `.luau`-main fallback.
 *
 * roblox-ts packages point `"main"` at compiled Luau (`out/init.luau`), which
 * the browser can't run. When a bare import resolves to a `.luau`/`.lua` file,
 * the preview retries the package's TypeScript source at `src/index.ts(x)` —
 * the same convention lattice's own vitest aliases rely on. The path walk is a
 * pure function over an injected fs so it can be unit-tested without fixtures.
 *
 * A package with no source to retry (Luau plus `.d.ts`) is a dead end for the
 * browser, and this module also names that case — see
 * {@link describeLuauOnlyPackage} — so the plugin can say so instead of letting
 * Rollup parse the Luau.
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
 * The Luau-main package an importer would reach for a bare specifier: its
 * directory, its `"main"` as written, and its TypeScript source entry when it
 * has one. `undefined` when the package can't be found from the importer, or
 * when it isn't a Luau-main package at all (normal resolution handles those).
 */
function probeLuauPackage(
	specifier: string,
	importer: string,
	fs: ResolverFs,
): { dir: string; main: string; source?: string } | undefined {
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
							if (fs.isFile(source)) return { dir: pkgDir, main, source };
						}
						return { dir: pkgDir, main };
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
 * normal resolution proceeds — and, deliberately, for a *declaration-only*
 * package (Luau plus `.d.ts`): declarations are types, not code, and handing
 * Vite a `.d.ts` as an executable module would only move the failure later.
 */
export function resolvePackageSource(
	specifier: string,
	importer: string,
	fs: ResolverFs,
): string | undefined {
	return probeLuauPackage(specifier, importer, fs)?.source;
}

/** A package whose only runtime entry is Luau, with no source to fall back to. */
export interface LuauOnlyPackage {
	/** The package root of the specifier (`@scope/name`). */
	name: string;
	/** The runtime entry that can't run: the `"main"` field, or a resolved id. */
	main: string;
}

/**
 * Identify a package that offers the browser nothing at all: a `"main"` that
 * points at Lua/Luau and no `src/index.ts(x)` to redirect to — the shape behind
 * Vite's opaque `Failed to resolve entry for package`, and the one case where
 * `shims` (or a built-in adapter) is the only way forward.
 *
 * Narrow by design: it reports only what it has read out of a real
 * `package.json`, so an ordinary JavaScript package that failed to resolve for
 * any other reason keeps its own error.
 */
export function describeLuauOnlyPackage(
	specifier: string,
	importer: string,
	fs: ResolverFs,
): LuauOnlyPackage | undefined {
	const probe = probeLuauPackage(specifier, importer, fs);
	if (!probe || probe.source !== undefined) return undefined;
	return { name: packageRootOf(specifier), main: probe.main };
}

/**
 * The error loom raises for {@link describeLuauOnlyPackage}. Rollup would
 * otherwise try to *parse* the Luau — "Expression expected" pointing into
 * someone else's `init.luau` — and Vite's own message names an entry file
 * without saying why a browser can't have it.
 *
 * Deliberately does not promise loom can translate the package: the fix is a
 * replacement module the project supplies.
 */
export function luauOnlyPackageError(
	pkg: LuauOnlyPackage,
	importer?: string,
	cause?: unknown,
): Error {
	const short = pkg.name.split("/").at(-1) ?? pkg.name;
	const error = new Error(
		`[loom] Package "${pkg.name}" only provides a Lua/Luau runtime ` +
			`("${pkg.main}") and cannot run in the browser.` +
			(importer ? `\nImported by ${importer}` : "") +
			"\n\nProvide a browser-compatible replacement with:\n\n" +
			"loomPreview({\n" +
			"  shims: {\n" +
			`    "${pkg.name}": "./loom-shims/${short}.ts",\n` +
			"  },\n" +
			"});\n\n" +
			"The same `shims` option exists on loom.config.ts, `loom-dev/embed` " +
			"and withLoomGallery().",
		cause === undefined ? undefined : { cause },
	);
	return error;
}
