/**
 * `@loom-dev/preview/vite` — the Vite plugin that makes a roblox-ts source tree
 * run in the browser: it aliases the `@rbxts/react` (and `@rbxts/vide`) packages
 * to the matching loom adapter and injects the Roblox globals before the app
 * entry. esbuild already transpiles the TSX, so no separate roblox-ts compiler is
 * needed for preview.
 */
import type { Plugin } from "vite";

// A virtual module that installs the Roblox globals. Injected as a real <script
// src> (not an inline bare import) so it resolves whether the index.html is a
// real file or served by the CLI's middleware.
const GLOBALS_ID = "virtual:loom-globals";
const GLOBALS_RESOLVED = `\0${GLOBALS_ID}`;
const GLOBALS_URL = `/@id/__x00__${GLOBALS_ID}`;

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

export function loomPreview(): Plugin {
	return {
		name: "loom-preview",
		apply: "serve", // preview is dev-only; the /@id/ globals URL has no build chunk
		resolveId(id) {
			if (id === GLOBALS_ID) return GLOBALS_RESOLVED;
		},
		load(id) {
			if (id === GLOBALS_RESOLVED) return 'import "@loom-dev/preview/globals";';
		},
		// Self-sufficient config so dropping loomPreview() into a project is truly
		// zero-config (no manual esbuild.jsx / optimizeDeps needed). Deep-merged
		// with — and overridable by — the user's config.
		config() {
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
					// The aliased @rbxts/react and the reconciler's react must be one
					// instance or hooks dispatch breaks ("Invalid hook call").
					dedupe: ["react"],
					alias: [
						// More specific first: react-roblox (+ any subpath) -> client shim.
						{
							find: /^@rbxts\/react-roblox(\/.*)?$/,
							replacement: "@loom-dev/preview/client",
						},
						// @rbxts/react (+ subpaths like /jsx-runtime) -> plain react.
						{ find: /^@rbxts\/react\/(.*)$/, replacement: "react/$1" },
						{ find: /^@rbxts\/react$/, replacement: "react" },
						// @rbxts/vide -> the loom vide adapter (same Scene IR target).
						{ find: /^@rbxts\/vide$/, replacement: "@loom-dev/vide" },
					],
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
}
