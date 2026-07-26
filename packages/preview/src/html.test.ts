// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { extractModuleScriptSrcs, findEntry } from "./html.ts";

describe("findEntry", () => {
	const fixture = mkdtempSync(join(tmpdir(), "loom-entry-test-"));
	afterAll(() => rmSync(fixture, { recursive: true, force: true }));

	const seed = (rel: string): void => {
		const parts = rel.split("/");
		mkdirSync(join(fixture, ...parts.slice(0, -1)), { recursive: true });
		writeFileSync(join(fixture, ...parts), "export {};\n");
	};

	it("returns undefined when the project has no conventional entry", () => {
		expect(findEntry(fixture)).toBeUndefined();
	});

	it("finds a root-relative client entry", () => {
		seed("src/main.tsx");
		expect(findEntry(fixture)).toBe("/src/main.tsx");
	});

	it("prefers the roblox-ts client convention over a plain main", () => {
		seed("src/main.client.tsx");
		expect(findEntry(fixture)).toBe("/src/main.client.tsx");
	});
});

describe("extractModuleScriptSrcs", () => {
	it("reads module script srcs, in document order", () => {
		const srcs = extractModuleScriptSrcs(
			`<script type="module" src="/src/a.ts"></script>` +
				`<script type='module' src='./b.ts'></script>`,
		);
		expect(srcs).toEqual(["/src/a.ts", "./b.ts"]);
	});

	it("ignores classic scripts and inline modules, and reads unquoted srcs", () => {
		const srcs = extractModuleScriptSrcs(
			`<script src="/legacy.js"></script>` +
				`<script type="module">import "./inline.ts";</script>` +
				`<script type=module src=/bare.ts></script>`,
		);
		expect(srcs).toEqual(["/bare.ts"]);
	});
});
