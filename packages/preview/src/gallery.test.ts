// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
	DEFAULT_TARGETS_GLOB,
	findLoomTargets,
	generateBuildEntryModule,
	generateBuildTargetsModule,
	generateTargetsModule,
	globToRegExp,
	normalizeTargetsPatterns,
	parseGalleryParams,
	toViteFsUrl,
} from "./gallery.ts";
import { GALLERY_SHELL_URL } from "./gallery-plugin.ts";
import { generateGalleryHtml, generateIndexHtml } from "./html.ts";
import { GALLERY_DEV_SHELL_PATH } from "./paths.ts";

describe("toViteFsUrl", () => {
	it("converts POSIX and Windows absolute paths on every host OS", () => {
		expect(toViteFsUrl("/proj/app/src/Scene.loom.tsx")).toBe(
			"/@fs/proj/app/src/Scene.loom.tsx",
		);
		expect(toViteFsUrl("C:\\proj\\app\\src\\Scene.loom.tsx")).toBe(
			"/@fs/C:/proj/app/src/Scene.loom.tsx",
		);
		expect(toViteFsUrl("C:/proj/app/src/Scene.loom.tsx")).toBe(
			"/@fs/C:/proj/app/src/Scene.loom.tsx",
		);
	});

	it("uses Vite's prefix joining for UNC and repeated leading separators", () => {
		expect(toViteFsUrl("\\\\server\\share\\Scene.loom.tsx")).toBe(
			"/@fs/server/share/Scene.loom.tsx",
		);
		expect(toViteFsUrl("///proj//app/Scene.loom.tsx")).toBe(
			"/@fs/proj/app/Scene.loom.tsx",
		);
	});

	it("builds the gallery shell URL through the same helper", () => {
		expect(GALLERY_SHELL_URL).toBe(toViteFsUrl(GALLERY_DEV_SHELL_PATH));
		expect(toViteFsUrl("C:\\loom\\preview\\src\\gallery\\shell.ts")).toBe(
			"/@fs/C:/loom/preview/src/gallery/shell.ts",
		);
	});
});

describe("globToRegExp", () => {
	it("matches **/*.loom.tsx at any depth, including the top level", () => {
		const re = globToRegExp("**/*.loom.tsx");
		expect(re.test("A.loom.tsx")).toBe(true);
		expect(re.test("src/targets/B.loom.tsx")).toBe(true);
		expect(re.test("src/targets/C.tsx")).toBe(false);
		expect(re.test("src/targets/D.loom.tsx.bak")).toBe(false);
	});

	it("keeps single * within one path segment", () => {
		const re = globToRegExp("src/*.loom.tsx");
		expect(re.test("src/A.loom.tsx")).toBe(true);
		expect(re.test("src/nested/A.loom.tsx")).toBe(false);
	});

	it("escapes regex metacharacters in literals", () => {
		const re = globToRegExp("a+b/(x)/*.loom.tsx");
		expect(re.test("a+b/(x)/Y.loom.tsx")).toBe(true);
		expect(re.test("aab/(x)/Y.loom.tsx")).toBe(false);
	});
});

describe("normalizeTargetsPatterns", () => {
	it("uses the default glob for a bare --targets flag", () => {
		expect(normalizeTargetsPatterns(true)).toEqual([DEFAULT_TARGETS_GLOB]);
	});

	it("expands a plain directory to <dir>/**/*.loom.tsx", () => {
		expect(normalizeTargetsPatterns("src/preview-targets")).toEqual([
			`src/preview-targets/${DEFAULT_TARGETS_GLOB}`,
		]);
		expect(normalizeTargetsPatterns("./src/preview-targets/")).toEqual([
			`src/preview-targets/${DEFAULT_TARGETS_GLOB}`,
		]);
	});

	it("passes explicit globs through unchanged", () => {
		expect(normalizeTargetsPatterns("src/**/*.loom.tsx")).toEqual([
			"src/**/*.loom.tsx",
		]);
	});

	it("treats '.' as the default glob and supports arrays", () => {
		expect(normalizeTargetsPatterns(".")).toEqual([DEFAULT_TARGETS_GLOB]);
		expect(normalizeTargetsPatterns(["a", "b/**/*.loom.tsx"])).toEqual([
			`a/${DEFAULT_TARGETS_GLOB}`,
			"b/**/*.loom.tsx",
		]);
	});
});

describe("findLoomTargets", () => {
	const fixture = mkdtempSync(join(tmpdir(), "loom-gallery-test-"));
	afterAll(() => rmSync(fixture, { recursive: true, force: true }));

	const seed = (rel: string): void => {
		const parts = rel.split("/");
		if (parts.length > 1)
			mkdirSync(join(fixture, ...parts.slice(0, -1)), { recursive: true });
		writeFileSync(join(fixture, ...parts), "export {};\n");
	};
	seed("Top.loom.tsx");
	seed("src/targets/Card.loom.tsx");
	seed("src/targets/deep/Nested.loom.tsx");
	seed("src/targets/NotATarget.tsx");
	seed("node_modules/pkg/Sneaky.loom.tsx");
	seed("src/node_modules/pkg/Sneaky2.loom.tsx");
	seed(".hidden/Secret.loom.tsx");

	it("finds nested targets and ignores node_modules and dot-dirs", () => {
		expect(findLoomTargets(fixture, ["**/*.loom.tsx"])).toEqual([
			"Top.loom.tsx",
			"src/targets/Card.loom.tsx",
			"src/targets/deep/Nested.loom.tsx",
		]);
	});

	it("scopes discovery to a directory pattern", () => {
		expect(
			findLoomTargets(fixture, normalizeTargetsPatterns("src/targets")),
		).toEqual([
			"src/targets/Card.loom.tsx",
			"src/targets/deep/Nested.loom.tsx",
		]);
	});

	it("returns nothing for a pattern with no matches", () => {
		expect(findLoomTargets(fixture, ["missing/**/*.loom.tsx"])).toEqual([]);
	});
});

describe("generateTargetsModule", () => {
	it("emits a lazy /@fs import map keyed by relative path", () => {
		const code = generateTargetsModule("/proj/app", [
			"src/targets/Card.loom.tsx",
		]);
		expect(code).toContain("export const targets = {");
		expect(code).toContain(
			'"src/targets/Card.loom.tsx": () => import("/@fs/proj/app/src/targets/Card.loom.tsx"),',
		);
	});

	it("emits a valid lazy import for a Windows root on every host OS", () => {
		const code = generateTargetsModule("C:\\proj\\app", [
			"src/Scenes/Button.loom.tsx",
		]);
		expect(code).toContain(
			'"src/Scenes/Button.loom.tsx": () => import("/@fs/C:/proj/app/src/Scenes/Button.loom.tsx"),',
		);
		expect(code).not.toContain("/@fsC:");
	});

	it("escapes quotes and backslashes in paths", () => {
		const code = generateTargetsModule("/proj/app", [
			'we"ird/Ta\\rget.loom.tsx',
		]);
		expect(code).toContain(
			String.raw`"we\"ird/Ta\\rget.loom.tsx": () => import(`,
		);
		// The emitted body must be syntactically valid JS.
		expect(() => new Function(code.replace(/^export /m, ""))).not.toThrow();
	});

	it("emits an empty map when no targets exist", () => {
		expect(generateTargetsModule("/proj/app", [])).toContain(
			"export const targets = {\n\n}",
		);
	});
});

describe("parseGalleryParams", () => {
	it("reads ?target= and ?chrome=none (the docs-iframe deep-link)", () => {
		const p = parseGalleryParams(
			"?target=src/preview-targets/CheckboxBasicScene.loom.tsx&chrome=none",
		);
		expect(p.target).toBe("src/preview-targets/CheckboxBasicScene.loom.tsx");
		expect(p.chromeless).toBe(true);
	});

	it("tolerates a missing leading '?' and url-encoding", () => {
		const p = parseGalleryParams("target=a%2Fb.loom.tsx");
		expect(p.target).toBe("a/b.loom.tsx");
		expect(p.chromeless).toBe(false);
	});

	it("keeps chrome when the flag is absent or not 'none'", () => {
		expect(parseGalleryParams("").chromeless).toBe(false);
		expect(parseGalleryParams("?chrome=full").chromeless).toBe(false);
		expect(parseGalleryParams("?target=x").chromeless).toBe(false);
	});

	it("treats an empty target as absent", () => {
		expect(parseGalleryParams("?target=&chrome=none").target).toBeUndefined();
	});
});

describe("generated pages", () => {
	it("wires the gallery page to the entry and the shell's DOM contract", () => {
		const html = generateGalleryHtml("./entry.ts", "loom gallery");
		expect(html).toContain('<script type="module" src="./entry.ts">');
		expect(html).toContain('id="loom-gallery-sidebar"');
		expect(html).toContain('id="loom-gallery-stage"');
		expect(html).toContain('id="loom-root"');
	});

	it("gives the single-entry page a full-viewport #loom-root", () => {
		const html = generateIndexHtml("/src/main.client.tsx", "loom preview");
		expect(html).toContain('<script type="module" src="/src/main.client.tsx">');
		expect(html).toContain('id="loom-root"');
		expect(html).toContain("<title>loom preview</title>");
	});
});

describe("generateBuildEntryModule", () => {
	it("imports globals FIRST so installGlobals runs before app code", () => {
		const code = generateBuildEntryModule({
			globalsSpecifier: "../../packages/preview/src/globals.ts",
			targetsSpecifier: "./targets.ts",
			shellSpecifier: "../../packages/cli/src/gallery/gallery-shell.ts",
		});
		const globalsAt = code.indexOf("globals.ts");
		const targetsAt = code.indexOf("./targets.ts");
		const shellAt = code.indexOf("gallery-shell.ts");
		expect(globalsAt).toBeGreaterThanOrEqual(0);
		expect(globalsAt).toBeLessThan(targetsAt);
		expect(globalsAt).toBeLessThan(shellAt);
		expect(code).toContain("startGallery(targets);");
	});
});

describe("generateBuildTargetsModule", () => {
	it("emits a relative lazy import per target, keyed by relPath", () => {
		const code = generateBuildTargetsModule([
			{
				key: "src/preview-targets/Card.loom.tsx",
				specifier: "../../foo/src/preview-targets/Card.loom.tsx",
			},
		]);
		expect(code).toContain(
			'"src/preview-targets/Card.loom.tsx": () => import("../../foo/src/preview-targets/Card.loom.tsx"),',
		);
		// Valid JS body.
		expect(() => new Function(code.replace(/^export /m, ""))).not.toThrow();
	});

	it("escapes quotes/backslashes and emits an empty map for no targets", () => {
		expect(generateBuildTargetsModule([])).toContain(
			"export const targets = {\n\n}",
		);
		const code = generateBuildTargetsModule([
			{ key: 'we"ird', specifier: "./a\\b.loom.tsx" },
		]);
		expect(code).toContain(
			String.raw`"we\"ird": () => import("./a\\b.loom.tsx"),`,
		);
	});
});
