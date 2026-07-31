/**
 * `compat/entrypoints.ts` — which specifiers loom's React compatibility layer
 * answers for, and what it says about the ones it doesn't.
 *
 * `@rbxts/react` and `@rbxts/react-roblox` are Luau packages with no `exports`
 * field: their only published entry is `main`, so upstream itself has no
 * subpaths. Loom adds two of its own (`@rbxts/react/jsx-runtime` and its dev
 * twin) because a project may set `jsxImportSource: "@rbxts/react"`, and that is
 * the whole supported set.
 *
 * The reason this is a registry rather than one permissive `(\/.*)?` alias:
 * a catch-all quietly resolves `@rbxts/react-roblox/anything` to the preview's
 * `createRoot` module, so an import that was never adapted appears to work and
 * then fails somewhere else entirely. Naming the boundary turns that into one
 * accurate error at the import site.
 */

/** The package root of a bare specifier (`@scope/name/sub` → `@scope/name`). */
export function packageRootOf(specifier: string): string {
	const parts = specifier.split("/");
	return specifier.startsWith("@")
		? parts.slice(0, 2).join("/")
		: (parts[0] ?? specifier);
}

/**
 * The entrypoints loom adapts, per package. Order is the order the error
 * message lists them in, so the package root comes first.
 */
export const SUPPORTED_ENTRYPOINTS: Readonly<
	Record<string, readonly string[]>
> = {
	"@rbxts/react": [
		"@rbxts/react",
		"@rbxts/react/jsx-runtime",
		"@rbxts/react/jsx-dev-runtime",
	],
	"@rbxts/react-roblox": ["@rbxts/react-roblox"],
};

/**
 * The supported entrypoint list for a specifier loom adapts but cannot answer
 * for, or `undefined` when the specifier is fine (or belongs to a package loom
 * has no opinion about, which keeps its own resolution).
 */
export function unsupportedEntrypoint(
	specifier: string,
): { readonly pkg: string; readonly supported: readonly string[] } | undefined {
	const pkg = packageRootOf(specifier);
	const supported = SUPPORTED_ENTRYPOINTS[pkg];
	if (!supported || supported.includes(specifier)) return undefined;
	return { pkg, supported };
}

/**
 * The diagnostic for an adapted package's unsupported subpath.
 *
 * Deliberately raised at resolution time: left alone, the import would reach
 * real package resolution and fail as either "Failed to resolve entry" or a
 * Rollup parse error inside someone else's `.luau` — neither of which mentions
 * loom, the package, or what the browser layer actually covers.
 */
export function unsupportedEntrypointError(
	specifier: string,
	importer?: string,
): Error {
	const info = unsupportedEntrypoint(specifier);
	const supported = info?.supported ?? [];
	const pkg = info?.pkg ?? packageRootOf(specifier);
	return new Error(
		`[loom] The ${pkg} subpath "${specifier}" is not supported by\n` +
			"Loom's browser compatibility layer.\n\n" +
			"Supported entrypoints:\n" +
			supported.map((entry) => `- ${entry}`).join("\n") +
			(importer ? `\n\nImported by ${importer}` : ""),
	);
}
