/**
 * `loom build` — bundle a roblox-ts preview gallery into a static site.
 *
 * Where `loom preview` runs a Vite dev server, `loom build` runs `vite build`
 * programmatically to emit a self-contained, client-only SPA into `--out`. The
 * output hosts anywhere (assets are relative under `--base`, default `./`) and
 * is what an Astro docs site embeds: each target is deep-linkable through the
 * `?target=<relPath>` / `?chrome=none` URL contract (see {@link parseGalleryParams}).
 *
 * The pipeline writes three real files into a scratch entry dir inside the loom
 * repo's `node_modules` — so bare specifiers (`@loom-dev/preview/*`, `react`)
 * resolve and Rollup can follow every import as a real module graph:
 *
 *   index.html  →  entry.ts  →  { @loom-dev/preview/globals, ./targets, shell }
 *
 * `entry.ts` imports globals **first** (installGlobals before any app code),
 * then a generated `targets.ts` whose relative `import()`s Rollup code-splits
 * into per-target async chunks. Target discovery reuses `findLoomTargets`; the
 * loom plugins (`loomPreview()`) supply the `@rbxts/*` aliases, react pinning,
 * `.luau`-main fallback, and `import X = require` rewrite under Rollup exactly
 * as under the dev server.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { loomPreview } from "@loom-dev/preview/vite";
import { build } from "vite";
import {
	findLoomTargets,
	generateBuildEntryModule,
	generateBuildIndexHtml,
	generateBuildTargetsModule,
	normalizeTargetsPatterns,
} from "./gallery";

/**
 * A directory guaranteed to contain the shell sources, for Vite's
 * `server.fs.allow`: the repo root in the workspace, the installing project's
 * root once published (this module runs from `src/` and `dist/` respectively,
 * both one level under the package root).
 */
const LOOM_REPO_ROOT = fileURLToPath(
	new URL("../../..", import.meta.url),
).replace(/[/\\]+$/, "");

/**
 * The shared gallery shell, imported by the generated entry via a relative path.
 * Read out of the shipped `src/` so the same TypeScript source is handed to Vite
 * from a workspace checkout and from a published install alike.
 */
const GALLERY_SHELL_PATH = fileURLToPath(
	new URL("../src/gallery/gallery-shell.ts", import.meta.url),
);

// The generated scratch files sit inside `node_modules`, where pnpm does NOT
// hoist the workspace `@loom-dev/*` packages — so the entry imports globals by
// resolved absolute path (made relative to the scratch dir), not by bare
// specifier. globals.ts's own `@loom-dev/runtime` import then resolves from its
// real location. The gallery shell (also imported by real path) resolves its
// own `@loom-dev/preview/client` + `react` the same way.
const GLOBALS_PATH = createRequire(import.meta.url).resolve(
	"@loom-dev/preview/globals",
);

/** Make an import specifier relative to `fromDir`, posix-style with a leading `./`. */
function relSpecifier(fromDir: string, toPath: string): string {
	let rel = relative(fromDir, toPath).split(sep).join("/");
	if (!rel.startsWith(".")) rel = `./${rel}`;
	return rel;
}

export interface BuildOptions {
	/** Project dir to discover targets under (resolved against cwd). */
	dir: string;
	/** `--targets` value: `true` for the default glob, or a glob/dir string. */
	targets: string | true;
	/** `--out` dir for the static bundle (resolved against cwd). */
	out: string;
	/** `--base` public path; `./` (default) keeps assets relative for any host. */
	base?: string;
}

/**
 * Run the static gallery build. Returns the resolved output dir. Throws on
 * discovery/build failure (the CLI turns that into a non-zero exit).
 */
export async function runBuild(options: BuildOptions): Promise<string> {
	const root = resolve(process.cwd(), options.dir);
	const outDir = resolve(process.cwd(), options.out);
	const base = options.base ?? "./";
	const patterns = normalizeTargetsPatterns(options.targets);

	const relPaths = findLoomTargets(root, patterns);
	if (relPaths.length === 0) {
		throw new Error(
			`no targets matched ${patterns.join(", ")} under ${root} — nothing to build`,
		);
	}

	// The scratch entry dir lives inside the loom repo's node_modules so bare
	// specifiers resolve; a unique dir avoids clobbering a concurrent build.
	const scratchDir = mkdtempSync(
		join(LOOM_REPO_ROOT, "node_modules", ".loom-build-"),
	);
	try {
		const targetEntries = relPaths.map((rel) => ({
			key: rel,
			specifier: relSpecifier(scratchDir, resolve(root, ...rel.split("/"))),
		}));
		writeFileSync(
			join(scratchDir, "targets.ts"),
			generateBuildTargetsModule(targetEntries),
		);
		writeFileSync(
			join(scratchDir, "entry.ts"),
			generateBuildEntryModule({
				globalsSpecifier: relSpecifier(scratchDir, GLOBALS_PATH),
				targetsSpecifier: "./targets.ts",
				shellSpecifier: relSpecifier(scratchDir, GALLERY_SHELL_PATH),
			}),
		);
		const indexHtmlPath = join(scratchDir, "index.html");
		writeFileSync(indexHtmlPath, generateBuildIndexHtml("./entry.ts"));

		await build({
			root: scratchDir,
			base,
			configFile: false,
			logLevel: "warn",
			plugins: [loomPreview()],
			build: {
				outDir,
				emptyOutDir: true, // outDir is outside root; opt in to clearing it
				rollupOptions: { input: indexHtmlPath },
			},
		});
	} finally {
		rmSync(scratchDir, { recursive: true, force: true });
	}

	return outDir;
}
