import { describe, expect, it } from "vitest";
import { rewriteImportEquals } from "./transform.ts";

describe("rewriteImportEquals", () => {
	it("rewrites a double-quoted import-equals", () => {
		expect(rewriteImportEquals('import React = require("@rbxts/react");')).toBe(
			'import * as React from "@rbxts/react";',
		);
	});

	it("rewrites a single-quoted import-equals", () => {
		expect(rewriteImportEquals("import React = require('@rbxts/react');")).toBe(
			"import * as React from '@rbxts/react';",
		);
	});

	it("rewrites without a trailing semicolon", () => {
		expect(rewriteImportEquals('import R = require("m")')).toBe(
			'import * as R from "m";',
		);
	});

	it("rewrites multiple occurrences and preserves the rest of the file", () => {
		const input = [
			'import React = require("@rbxts/react");',
			'import ReactRoblox = require("@rbxts/react-roblox");',
			"",
			"export default React;",
			"export const roblox = ReactRoblox;",
		].join("\n");
		expect(rewriteImportEquals(input)).toBe(
			[
				'import * as React from "@rbxts/react";',
				'import * as ReactRoblox from "@rbxts/react-roblox";',
				"",
				"export default React;",
				"export const roblox = ReactRoblox;",
			].join("\n"),
		);
	});

	it("preserves indentation and tolerates loose spacing", () => {
		expect(rewriteImportEquals('\timport R  =  require ( "m" ) ;')).toBe(
			'\timport * as R from "m";',
		);
	});

	it("leaves `const x = require(...)` untouched", () => {
		const input = 'const x = require("m");';
		expect(rewriteImportEquals(input)).toBeUndefined();
	});

	it("leaves line comments untouched", () => {
		const input = '// import React = require("@rbxts/react");';
		expect(rewriteImportEquals(input)).toBeUndefined();
	});

	it("only rewrites the real statement when a comment mentions one too", () => {
		const input = [
			'// import Old = require("old");',
			'import React = require("@rbxts/react");',
		].join("\n");
		expect(rewriteImportEquals(input)).toBe(
			[
				'// import Old = require("old");',
				'import * as React from "@rbxts/react";',
			].join("\n"),
		);
	});

	it("returns undefined when there is nothing to rewrite", () => {
		expect(
			rewriteImportEquals('import { a } from "b";\nexport const c = a;'),
		).toBeUndefined();
	});

	it("is idempotent", () => {
		const once = rewriteImportEquals('import React = require("@rbxts/react");');
		expect(once).toBeDefined();
		expect(rewriteImportEquals(once as string)).toBeUndefined();
	});
});
