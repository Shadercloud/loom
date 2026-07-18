/**
 * `@loom-dev/preview/vite` — the Vite plugin that makes a roblox-ts source tree
 * run in the browser: it aliases the `@rbxts/react` / `@rbxts/react-roblox` /
 * `@rbxts/services` (and `@rbxts/vide`) packages to the matching loom adapter,
 * rewrites roblox-ts `import X = require(...)` statements to ESM, retries
 * `.luau` package mains at their TypeScript source, and injects the Roblox
 * globals before the app entry. esbuild already transpiles the TSX, so no
 * separate roblox-ts compiler is needed for preview.
 *
 * The resolver, the import-equals transform, and the config-hook aliases apply
 * in **both** `serve` and `build`, so the same source tree that runs under the
 * dev server also bundles into a static site via `loom build`. Only the
 * globals-injection mechanism differs: under `serve` it is a `<script src>`
 * pointing at a served virtual module (`loom-preview:serve-globals`); under
 * `build` the generated HTML entry imports `@loom-dev/preview/globals` as its
 * first module so `installGlobals()` runs before any app/gallery code.
 */
import { readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type Plugin, searchForWorkspaceRoot } from "vite";
import {
	isLuauId,
	type ResolverFs,
	resolveLuauFallback,
	resolvePackageSource,
} from "./resolver";
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
const REACT_SHIM_PATH = join(PREVIEW_SRC, "react-shim.js");
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
	readFile(path: string): string | undefined {
		try {
			return readFileSync(path, "utf8");
		} catch {
			return undefined;
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
	// resolve through symlinks to real paths outside node_modules. Runs in both
	// serve and build: esbuild lowers import-equals the same way in either mode,
	// so the rewrite is equally required when Rollup bundles the tree.
	const importEquals: Plugin = {
		name: "loom-preview:import-equals",
		enforce: "pre",
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
		// No `apply`: the resolver + config aliases are build-safe and must run
		// under Rollup so `loom build` bundles the same tree the dev server serves.
		// `pre` is load-bearing for resolveId: vite:resolve (a core plugin) runs
		// before user *normal* plugins, so a normal-phase hook would never see the
		// bare specifiers whose package "main" points at `.luau` output.
		enforce: "pre",
		async resolveId(source, importer, options) {
			if (!importer || !isBareSpecifier(source)) return;

			const verdict = luauVerdicts.get(source);
			if (verdict !== undefined) {
				// `false` = known non-Luau: fall through to normal resolution.
				return verdict === false ? undefined : verdict;
			}

			// Redirect roblox-ts packages to their TS source up front — this works
			// whether or not the package was compiled (its `.luau` main may not
			// exist), so loom consumes a source-only workspace with no build step.
			// `@rbxts/*` is excluded: those are Luau-main too but must go through the
			// `resolve.alias` entries (react/react-roblox/services → loom adapters),
			// not to their own source.
			if (!source.startsWith("@rbxts/")) {
				const sourceTs = resolvePackageSource(source, importer, nodeFs);
				if (sourceTs !== undefined) {
					luauVerdicts.set(source, sourceTs);
					return sourceTs;
				}
			}

			// Otherwise resolve normally. `this.resolve` can throw when a package's
			// `"main"` points at a missing file; treat that as unresolved so Vite
			// reports it rather than crashing the plugin.
			let resolved: Awaited<ReturnType<typeof this.resolve>> = null;
			try {
				resolved = await this.resolve(source, importer, {
					...options,
					skipSelf: true,
				});
			} catch {
				resolved = null;
			}
			if (!resolved || resolved.external) return resolved ?? undefined;
			if (isLuauId(resolved.id)) {
				// A resolved `.luau` main (compiled roblox-ts package): retry source.
				const fallback = resolveLuauFallback(resolved.id, nodeFs);
				if (fallback !== undefined) {
					luauVerdicts.set(source, fallback);
					return fallback;
				}
			}
			luauVerdicts.set(source, false);
			return resolved;
		},
		// Self-sufficient config so dropping loomPreview() into a project is truly
		// zero-config (no manual esbuild.jsx / optimizeDeps needed). Deep-merged
		// with — and overridable by — the user's config. `optimizeDeps` and
		// `server.fs` are dev-only (Vite ignores them under `build`); the
		// `resolve.alias` + `esbuild.jsx` entries drive both modes.
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
						// @rbxts/react -> a shim adding React.Event/React.Change
						// keyed-prop namespaces on top of loom's react instance.
						{ find: /^@rbxts\/react$/, replacement: REACT_SHIM_PATH },
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
	};

	// Serve-only globals injection. Under the dev server the Roblox datatype
	// globals are installed by a `<script src>` pointing at a served virtual
	// module (there is no build chunk for the `/@id/` URL). Under `build` this
	// plugin is inert — the CLI's generated HTML entry imports
	// `@loom-dev/preview/globals` directly as its first module instead.
	const serveGlobals: Plugin = {
		name: "loom-preview:serve-globals",
		apply: "serve",
		enforce: "pre",
		resolveId(source) {
			if (source === GLOBALS_ID) return GLOBALS_RESOLVED;
		},
		load(id) {
			// Absolute-path import: the virtual module has no fs location, so a
			// bare "@loom-dev/preview/globals" would resolve from the (possibly
			// foreign) project root and fail.
			if (id === GLOBALS_RESOLVED)
				return `import ${JSON.stringify(GLOBALS_PATH)};`;
		},
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

	return [importEquals, main, serveGlobals];
}
