/**
 * `@loom-dev/preview/vite` — the Vite plugin that makes a roblox-ts source tree
 * run in the browser: it aliases the `@rbxts/react` / `@rbxts/react-roblox` /
 * `@rbxts/services` (and `@rbxts/vide`) packages to the matching loom adapter,
 * rewrites roblox-ts `import X = require(...)` statements to ESM, retries
 * `.luau` package mains at their TypeScript source, and injects the Roblox
 * globals before the app entry. esbuild already transpiles the TSX, so no
 * separate roblox-ts compiler is needed for preview.
 */
import { statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type Plugin, searchForWorkspaceRoot } from "vite";
import { isLuauId, type ResolverFs, resolveLuauFallback } from "./resolver";
import { rewriteImportEquals } from "./transform";

// A virtual module that installs the Roblox globals. Injected as a real <script
// src> (not an inline bare import) so it resolves whether the index.html is a
// real file or served by the CLI's middleware.
const GLOBALS_ID = "virtual:loom-globals";
const GLOBALS_RESOLVED = `\0${GLOBALS_ID}`;
const GLOBALS_URL = `/@id/__x00__${GLOBALS_ID}`;

// This file lives at <loom repo>/packages/preview/src/vite.ts. The preview's
// sibling modules are aliased by absolute path (not bare specifier) so they
// resolve even when the previewed project's node_modules has no @loom-dev
// packages — e.g. `loom preview` pointed at a different workspace entirely.
const PREVIEW_SRC = dirname(fileURLToPath(import.meta.url));
const LOOM_REPO_ROOT = resolve(PREVIEW_SRC, "../../..");
const CLIENT_PATH = join(PREVIEW_SRC, "client.ts");
const SERVICES_PATH = join(PREVIEW_SRC, "services.ts");
const GLOBALS_PATH = join(PREVIEW_SRC, "globals.ts");

// loom's internal packages own the WASM engine; don't pre-bundle them (their
// `new URL(...wasm)` must stay intact), and pre-bundle the CJS react-reconciler.
const LOOM_PACKAGES = [
	"@loom-dev/preview",
	"@loom-dev/react",
	"@loom-dev/vide",
	"@loom-dev/runtime",
	"@loom-dev/renderer",
	"@loom-dev/scene",
	"@loom-dev/layout",
];

const nodeFs: ResolverFs = {
	isFile(path: string): boolean {
		try {
			return statSync(path).isFile();
		} catch {
			return false;
		}
	},
};

// react (and its jsx runtimes) must come from loom's own dependency tree —
// version-matched to the loom react adapter's react-reconciler — not whatever
// react the previewed workspace hoists (lattice hoists react 19, whose renamed
// internals crash reconciler 0.29 at evaluation). Resolved to absolute paths
// here; both dev import analysis and the dep optimizer honor `resolve.alias`,
// so every consumer converges on this single copy.
const requireFromPreview = createRequire(import.meta.url);
const REACT_MAIN = requireFromPreview.resolve("react");
const REACT_JSX = requireFromPreview.resolve("react/jsx-runtime");
const REACT_JSX_DEV = requireFromPreview.resolve("react/jsx-dev-runtime");

/** Bare npm specifiers only: not relative/absolute/virtual/builtin/url ids. */
function isBareSpecifier(source: string): boolean {
	if (source.startsWith(".") || source.startsWith("/")) return false;
	if (source.startsWith("\0")) return false;
	// Excludes `node:`, `virtual:`, `data:`, `http(s):` — scoped packages and
	// subpaths never contain `:`.
	if (source.includes(":")) return false;
	return true;
}

export function loomPreview(): Plugin[] {
	// Per-source memo of the `.luau` fallback verdict. Workspace packages are
	// unique per specifier, so the importer doesn't need to be part of the key;
	// a `false` verdict just means "not Luau — let normal resolution handle it".
	const luauVerdicts = new Map<string, string | false>();

	// Rewrites `import X = require("m")` before vite:esbuild lowers it to a bare
	// `require()` call (which would throw in the browser). Applies to any
	// TypeScript outside node_modules — previewed workspace sources typically
	// resolve through symlinks to real paths outside node_modules.
	const importEquals: Plugin = {
		name: "loom-preview:import-equals",
		enforce: "pre",
		apply: "serve",
		transform(code, id) {
			const file = id.split("?")[0] ?? id;
			if (!/\.tsx?$/.test(file)) return;
			if (file.includes("/node_modules/")) return;
			const rewritten = rewriteImportEquals(code);
			if (rewritten === undefined) return;
			return { code: rewritten, map: null };
		},
	};

	const main: Plugin = {
		name: "loom-preview",
		apply: "serve", // preview is dev-only; the /@id/ globals URL has no build chunk
		// `pre` is load-bearing for resolveId: vite:resolve (a core plugin) runs
		// before user *normal* plugins, so a normal-phase hook would never see the
		// bare specifiers whose package "main" points at `.luau` output.
		enforce: "pre",
		async resolveId(source, importer, options) {
			if (source === GLOBALS_ID) return GLOBALS_RESOLVED;
			if (!importer || !isBareSpecifier(source)) return;

			const verdict = luauVerdicts.get(source);
			if (verdict !== undefined) {
				// `false` = known non-Luau: fall through to normal resolution.
				return verdict === false ? undefined : verdict;
			}

			const resolved = await this.resolve(source, importer, {
				...options,
				skipSelf: true,
			});
			if (!resolved || resolved.external) return resolved ?? undefined;
			if (isLuauId(resolved.id)) {
				// A roblox-ts package main (e.g. lattice's `out/init.luau`):
				// retry the package's TypeScript source.
				const fallback = resolveLuauFallback(resolved.id, nodeFs);
				if (fallback !== undefined) {
					luauVerdicts.set(source, fallback);
					return fallback;
				}
			}
			luauVerdicts.set(source, false);
			return resolved;
		},
		load(id) {
			// Absolute-path import: the virtual module has no fs location, so a
			// bare "@loom-dev/preview/globals" would resolve from the (possibly
			// foreign) project root and fail.
			if (id === GLOBALS_RESOLVED)
				return `import ${JSON.stringify(GLOBALS_PATH)};`;
		},
		// Self-sufficient config so dropping loomPreview() into a project is truly
		// zero-config (no manual esbuild.jsx / optimizeDeps needed). Deep-merged
		// with — and overridable by — the user's config.
		config(userConfig) {
			const projectRoot = userConfig.root
				? resolve(userConfig.root)
				: process.cwd();
			return {
				// Automatic JSX runtime: roblox-ts source never imports React, so the
				// classic transform would throw "React is not defined".
				esbuild: { jsx: "automatic" },
				optimizeDeps: {
					// react-reconciler is CJS and imported by the (unoptimized, linked)
					// @loom-dev/react package — the nested `>` form resolves it through
					// the workspace link chain; a bare "react-reconciler" fails to
					// resolve from the app root under pnpm's strict node_modules.
					include: [
						"react",
						"react/jsx-runtime",
						"react/jsx-dev-runtime",
						"@loom-dev/preview > @loom-dev/react > react-reconciler",
						"@loom-dev/preview > @loom-dev/react > react-reconciler/constants",
					],
					exclude: LOOM_PACKAGES,
				},
				resolve: {
					// One react instance is enforced by the absolute-path react aliases
					// below (the aliased @rbxts/react and the reconciler's react must be
					// the same react or hooks dispatch breaks) — `dedupe` would instead
					// re-anchor react at the *project* root, which may hoist a
					// different major.
					alias: [
						// More specific first: react-roblox (+ any subpath) -> client
						// shim. Absolute paths so the previewed project's node_modules
						// doesn't need @loom-dev packages.
						{
							find: /^@rbxts\/react-roblox(\/.*)?$/,
							replacement: CLIENT_PATH,
						},
						// @rbxts/services -> the preview's service singletons.
						{ find: /^@rbxts\/services$/, replacement: SERVICES_PATH },
						// @rbxts/react (+ jsx runtimes) and bare react -> loom's react.
						{ find: /^@rbxts\/react\/jsx-runtime$/, replacement: REACT_JSX },
						{
							find: /^@rbxts\/react\/jsx-dev-runtime$/,
							replacement: REACT_JSX_DEV,
						},
						{ find: /^@rbxts\/react$/, replacement: REACT_MAIN },
						{ find: /^react\/jsx-runtime$/, replacement: REACT_JSX },
						{ find: /^react\/jsx-dev-runtime$/, replacement: REACT_JSX_DEV },
						{ find: /^react$/, replacement: REACT_MAIN },
						// @rbxts/vide -> the loom vide adapter (same Scene IR target).
						{ find: /^@rbxts\/vide$/, replacement: "@loom-dev/vide" },
					],
				},
				server: {
					fs: {
						// The previewed project may live in a different workspace than
						// loom itself (e.g. `loom preview ../lattice-ui/apps/x` run via
						// tsx from the loom repo) — the server must be allowed to serve
						// both trees. Merged additively with any user-supplied allow.
						allow: [LOOM_REPO_ROOT, searchForWorkspaceRoot(projectRoot)],
					},
				},
			};
		},
		// Install the Roblox datatype globals before any app module evaluates.
		transformIndexHtml() {
			return [
				{
					tag: "script",
					attrs: { type: "module", src: GLOBALS_URL },
					injectTo: "head-prepend",
				},
			];
		},
	};

	return [importEquals, main];
}
