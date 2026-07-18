import { describe, expect, it } from "vitest";
import {
	isLuauId,
	type ResolverFs,
	resolveLuauFallback,
	resolvePackageSource,
} from "./resolver";

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

	it("returns undefined without a readFile capability", () => {
		const fs = fakeFs([`${layerPkg}/package.json`, `${layerPkg}/src/index.ts`]);
		expect(
			resolvePackageSource("@lattice-ui/layer", importer, fs),
		).toBeUndefined();
	});
});
