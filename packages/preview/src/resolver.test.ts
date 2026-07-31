import { describe, expect, it } from "vitest";
import {
	describeLuauOnlyPackage,
	isLuauId,
	luauOnlyPackageError,
	type ResolverFs,
	resolveLuauFallback,
	resolvePackageSource,
} from "./resolver.ts";

function fakeFs(files: string[]): ResolverFs {
	const set = new Set(files);
	return { isFile: (path) => set.has(path) };
}

/** fakeFs plus a readFile backed by a path→contents map. */
function fakeFsWithContents(files: Record<string, string>): ResolverFs {
	const set = new Set(Object.keys(files));
	return {
		isFile: (path) => set.has(path),
		readFile: (path) => files[path],
	};
}

describe("isLuauId", () => {
	it("matches .luau and .lua files", () => {
		expect(isLuauId("/pkg/out/init.luau")).toBe(true);
		expect(isLuauId("/pkg/out/init.lua")).toBe(true);
	});

	it("ignores query strings and hashes", () => {
		expect(isLuauId("/pkg/out/init.luau?v=1")).toBe(true);
		expect(isLuauId("/pkg/src/index.ts?import")).toBe(false);
	});

	it("rejects TypeScript and lookalike ids", () => {
		expect(isLuauId("/pkg/src/index.ts")).toBe(false);
		expect(isLuauId("/pkg/src/index.tsx")).toBe(false);
		expect(isLuauId("/pkg/out/init.luau.map")).toBe(false);
	});
});

describe("resolveLuauFallback", () => {
	const pkg = "/ws/packages/checkbox";

	it("falls back to src/index.ts next to the owning package.json", () => {
		const fs = fakeFs([
			`${pkg}/package.json`,
			`${pkg}/out/init.luau`,
			`${pkg}/src/index.ts`,
		]);
		expect(resolveLuauFallback(`${pkg}/out/init.luau`, fs)).toBe(
			`${pkg}/src/index.ts`,
		);
	});

	it("tries src/index.tsx when src/index.ts is absent", () => {
		const fs = fakeFs([`${pkg}/package.json`, `${pkg}/src/index.tsx`]);
		expect(resolveLuauFallback(`${pkg}/out/init.luau`, fs)).toBe(
			`${pkg}/src/index.tsx`,
		);
	});

	it("prefers src/index.ts over src/index.tsx", () => {
		const fs = fakeFs([
			`${pkg}/package.json`,
			`${pkg}/src/index.ts`,
			`${pkg}/src/index.tsx`,
		]);
		expect(resolveLuauFallback(`${pkg}/out/init.luau`, fs)).toBe(
			`${pkg}/src/index.ts`,
		);
	});

	it("stops at the nearest package.json (never a parent package's src)", () => {
		const fs = fakeFs([
			"/ws/package.json",
			"/ws/src/index.ts",
			`${pkg}/package.json`,
		]);
		// checkbox has a package.json but no src entry: no fallback, even though
		// the workspace root above it has one.
		expect(resolveLuauFallback(`${pkg}/out/init.luau`, fs)).toBeUndefined();
	});

	it("walks up through nested out directories", () => {
		const fs = fakeFs([`${pkg}/package.json`, `${pkg}/src/index.ts`]);
		expect(resolveLuauFallback(`${pkg}/out/deep/nested/init.luau`, fs)).toBe(
			`${pkg}/src/index.ts`,
		);
	});

	it("returns undefined for non-Luau ids", () => {
		const fs = fakeFs([`${pkg}/package.json`, `${pkg}/src/index.ts`]);
		expect(resolveLuauFallback(`${pkg}/src/index.ts`, fs)).toBeUndefined();
	});

	it("returns undefined when no package.json exists anywhere above", () => {
		const fs = fakeFs([]);
		expect(resolveLuauFallback(`${pkg}/out/init.luau`, fs)).toBeUndefined();
	});

	it("strips query strings from the resolved id", () => {
		const fs = fakeFs([`${pkg}/package.json`, `${pkg}/src/index.ts`]);
		expect(resolveLuauFallback(`${pkg}/out/init.luau?v=2`, fs)).toBe(
			`${pkg}/src/index.ts`,
		);
	});
});

describe("resolvePackageSource", () => {
	const importer = "/ws/packages/dialog/src/Dialog/DialogContent.tsx";
	const layerPkg = "/ws/node_modules/@lattice-ui/layer";

	it("redirects a Luau-main package to its src without the .luau existing", () => {
		const fs = fakeFsWithContents({
			[`${layerPkg}/package.json`]: JSON.stringify({ main: "out/init.luau" }),
			[`${layerPkg}/src/index.ts`]: "",
		});
		expect(resolvePackageSource("@lattice-ui/layer", importer, fs)).toBe(
			`${layerPkg}/src/index.ts`,
		);
	});

	it("resolves the package root for a subpath specifier", () => {
		const fs = fakeFsWithContents({
			[`${layerPkg}/package.json`]: JSON.stringify({ main: "out/init.lua" }),
			[`${layerPkg}/src/index.tsx`]: "",
		});
		expect(resolvePackageSource("@lattice-ui/layer/extra", importer, fs)).toBe(
			`${layerPkg}/src/index.tsx`,
		);
	});

	it("ignores packages whose main is not Luau", () => {
		const pkg = "/ws/node_modules/react";
		const fs = fakeFsWithContents({
			[`${pkg}/package.json`]: JSON.stringify({ main: "index.js" }),
			[`${pkg}/src/index.ts`]: "",
		});
		expect(resolvePackageSource("react", importer, fs)).toBeUndefined();
	});

	it("returns undefined when the package has no src entry", () => {
		const fs = fakeFsWithContents({
			[`${layerPkg}/package.json`]: JSON.stringify({ main: "out/init.luau" }),
		});
		expect(
			resolvePackageSource("@lattice-ui/layer", importer, fs),
		).toBeUndefined();
	});

	it("never treats a declaration-only package's .d.ts as source", () => {
		// The `@rbxts/ui-labs` shape: a Luau runtime plus TypeScript *declarations*
		// and no `src/index.ts(x)`. There is nothing here a browser can execute, so
		// the resolver must decline rather than hand Vite a .d.ts — recovering this
		// package is a `shims` job, not a resolver one.
		const pkg = "/ws/node_modules/@rbxts/ui-labs";
		const fs = fakeFsWithContents({
			[`${pkg}/package.json`]: JSON.stringify({
				main: "src/init.lua",
				types: "src/index.d.ts",
			}),
			[`${pkg}/src/init.lua`]: "",
			[`${pkg}/src/index.d.ts`]: 'export { Environment } from "./Environment";',
		});
		expect(
			resolvePackageSource("@rbxts/ui-labs", importer, fs),
		).toBeUndefined();
	});

	it("declines the Ripple package shape rather than resolving its .d.ts", () => {
		// Verbatim from the reported failure: `"main": "src/init.luau"` with a
		// sibling `src/index.d.ts` and no runtime JavaScript anywhere. Resolving
		// the declaration file would produce a module with no code in it; loom
		// answers for these two packages with a built-in adapter instead (see
		// `./compat/aliases.ts`), which is why nothing here should resolve.
		for (const name of ["@rbxts/ripple", "@rbxts/react-ripple"]) {
			const pkg = `/ws/node_modules/${name}`;
			const fs = fakeFsWithContents({
				[`${pkg}/package.json`]: JSON.stringify({
					main: "src/init.luau",
					types: "src/index.d.ts",
				}),
				[`${pkg}/src/init.luau`]:
					"local Ripple = require(script.Parent.Ripple)",
				[`${pkg}/src/index.d.ts`]: "export function useSpring(): never;",
			});
			expect(resolvePackageSource(name, importer, fs)).toBeUndefined();
		}
	});

	it("returns undefined without a readFile capability", () => {
		const fs = fakeFs([`${layerPkg}/package.json`, `${layerPkg}/src/index.ts`]);
		expect(
			resolvePackageSource("@lattice-ui/layer", importer, fs),
		).toBeUndefined();
	});
});

describe("describeLuauOnlyPackage", () => {
	const importer = "/ws/app/src/main.client.tsx";

	it("names a package that ships Luau and declarations only", () => {
		const pkg = "/ws/node_modules/@rbxts/example";
		const fs = fakeFsWithContents({
			[`${pkg}/package.json`]: JSON.stringify({
				main: "src/init.lua",
				types: "src/index.d.ts",
			}),
			[`${pkg}/src/index.d.ts`]: "export const x: number;",
		});
		expect(describeLuauOnlyPackage("@rbxts/example", importer, fs)).toEqual({
			name: "@rbxts/example",
			main: "src/init.lua",
		});
		// A subpath belongs to the same package, and fails for the same reason.
		expect(
			describeLuauOnlyPackage("@rbxts/example/controls", importer, fs)?.name,
		).toBe("@rbxts/example");
	});

	it("stays quiet when the package has TypeScript source to fall back to", () => {
		const pkg = "/ws/node_modules/@rbxts/sourced";
		const fs = fakeFsWithContents({
			[`${pkg}/package.json`]: JSON.stringify({ main: "out/init.luau" }),
			[`${pkg}/src/index.ts`]: "",
		});
		expect(
			describeLuauOnlyPackage("@rbxts/sourced", importer, fs),
		).toBeUndefined();
	});

	it("stays quiet for ordinary JavaScript packages and for absent ones", () => {
		const pkg = "/ws/node_modules/react";
		const fs = fakeFsWithContents({
			[`${pkg}/package.json`]: JSON.stringify({ main: "index.js" }),
		});
		expect(describeLuauOnlyPackage("react", importer, fs)).toBeUndefined();
		expect(describeLuauOnlyPackage("missing", importer, fs)).toBeUndefined();
	});
});

describe("luauOnlyPackageError", () => {
	const error = luauOnlyPackageError(
		{ name: "@rbxts/example", main: "src/init.lua" },
		"/ws/app/src/main.client.tsx",
		new Error("Failed to resolve entry for package"),
	);

	it("names the package, its entry, the importer and the way out", () => {
		expect(error.message).toContain("[loom]");
		expect(error.message).toContain('Package "@rbxts/example"');
		expect(error.message).toContain("src/init.lua");
		expect(error.message).toContain("/ws/app/src/main.client.tsx");
		expect(error.message).toContain("shims");
		expect(error.message).toContain(
			'"@rbxts/example": "./loom-shims/example.ts"',
		);
	});

	it("promises no automatic translation, and keeps the original cause", () => {
		expect(error.message).not.toMatch(/automatic|translat|convert/i);
		expect((error.cause as Error).message).toBe(
			"Failed to resolve entry for package",
		);
	});

	it("works without an importer", () => {
		const bare = luauOnlyPackageError({ name: "pkg", main: "init.luau" });
		expect(bare.message).toContain('Package "pkg"');
		expect(bare.message).not.toContain("Imported by");
	});
});
