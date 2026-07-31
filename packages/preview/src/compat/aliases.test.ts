// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	REACT_RIPPLE_COMPAT_PATH,
	RIPPLE_COMPAT_PATH,
	UI_LABS_COMPAT_PATH,
} from "../paths.ts";
import {
	BUILT_IN_COMPATIBILITY_PACKAGES,
	builtInCompatibilityAliases,
	exactSpecifierPattern,
} from "./aliases.ts";

/** Vite's own alias matching: first entry whose `find` matches wins. */
function applyAliases(
	aliases: ReadonlyArray<{ find: RegExp; replacement: string }>,
	id: string,
): string | undefined {
	for (const { find, replacement } of aliases) {
		if (find.test(id)) return id.replace(find, replacement);
	}
	return undefined;
}

describe("exactSpecifierPattern", () => {
	it("matches the specifier and nothing around it", () => {
		const find = exactSpecifierPattern("@rbxts/ui-labs");
		expect(find.test("@rbxts/ui-labs")).toBe(true);
		expect(find.test("@rbxts/ui-labs/controls")).toBe(false);
		expect(find.test("@rbxts/ui-labs-extra")).toBe(false);
		expect(find.test("foo/@rbxts/ui-labs")).toBe(false);
	});

	it("escapes regex metacharacters", () => {
		const find = exactSpecifierPattern("pkg.name+x");
		expect(find.test("pkg.name+x")).toBe(true);
		// `.` and `+` must match themselves, not "any char" / "one or more".
		expect(find.test("pkgXname+x")).toBe(false);
		expect(find.test("pkg.name++x")).toBe(false);
	});
});

describe("builtInCompatibilityAliases", () => {
	const aliases = builtInCompatibilityAliases();

	it("maps the @rbxts/ui-labs root to loom's compatibility module", () => {
		expect(applyAliases(aliases, "@rbxts/ui-labs")).toBe(UI_LABS_COMPAT_PATH);
	});

	it("maps the Ripple packages to their loom runtimes", () => {
		expect(applyAliases(aliases, "@rbxts/ripple")).toBe(RIPPLE_COMPAT_PATH);
		expect(applyAliases(aliases, "@rbxts/react-ripple")).toBe(
			REACT_RIPPLE_COMPAT_PATH,
		);
	});

	it("leaves subpaths and prefix-lookalikes to fail on their own", () => {
		// The adapter answers for `Environment` only — a subpath it was never
		// written for must not silently land on it.
		expect(applyAliases(aliases, "@rbxts/ui-labs/controls")).toBeUndefined();
		expect(applyAliases(aliases, "@rbxts/ui-labs/stories")).toBeUndefined();
		expect(applyAliases(aliases, "@rbxts/ui-labs-extra")).toBeUndefined();
		expect(applyAliases(aliases, "foo/@rbxts/ui-labs")).toBeUndefined();
		// Same rule for Ripple: `@rbxts/ripple-extra` is somebody else's package,
		// and no subpath of either Ripple package is adapted.
		expect(applyAliases(aliases, "@rbxts/ripple/foo")).toBeUndefined();
		expect(applyAliases(aliases, "@rbxts/ripple-extra")).toBeUndefined();
		expect(applyAliases(aliases, "@rbxts/react-ripple/foo")).toBeUndefined();
		expect(applyAliases(aliases, "@rbxts/react-ripple-extra")).toBeUndefined();
		// `@rbxts/ripple` must not swallow the React package, or vice versa.
		expect(applyAliases(aliases, "@rbxts/react-ripple")).not.toBe(
			RIPPLE_COMPAT_PATH,
		);
	});

	it("touches no unrelated package", () => {
		for (const id of [
			"@rbxts/services",
			"@rbxts/react",
			"@rbxts/react-roblox",
			"react",
			"vite",
		]) {
			expect(applyAliases(aliases, id)).toBeUndefined();
		}
	});

	it("exposes the registry contents for docs and diagnostics", () => {
		expect(BUILT_IN_COMPATIBILITY_PACKAGES).toEqual([
			"@rbxts/ui-labs",
			"@rbxts/ripple",
			"@rbxts/react-ripple",
		]);
		expect(aliases).toHaveLength(BUILT_IN_COMPATIBILITY_PACKAGES.length);
	});
});
