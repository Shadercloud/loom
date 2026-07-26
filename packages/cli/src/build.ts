/**
 * `loom build` — bundle a roblox-ts preview gallery into a static site.
 *
 * Where `loom preview` runs a Vite dev server, `loom build` runs `vite build`
 * programmatically to emit a self-contained, client-only SPA into `--out`. The
 * output hosts anywhere (assets are relative under `--base`, default `./`) and
 * is what an Astro docs site embeds: each target is deep-linkable through the
 * `?target=<relPath>` / `?chrome=none` URL contract (see `parseGalleryParams`).
 *
 * The pipeline itself is just `loomPreview({ targets })` under `vite build`:
 * the plugin generates the gallery `index.html`, an entry module that imports
 * the globals **first** and then hands the shell a generated target map whose
 * relative `import()`s Rollup code-splits into per-target async chunks. The
 * same plugin supplies the `@rbxts/*` aliases, react pinning, `.luau`-main
 * fallback and `import X = require` rewrite it does under the dev server — so
 * `vite build` in a project whose `vite.config.ts` uses `loomPreview({ targets
 * })` produces exactly what this command does.
 */
import { resolve } from "node:path";
import {
	findLoomTargets,
	normalizeTargetsPatterns,
} from "@loom-dev/preview/gallery";
import { loomPreview } from "@loom-dev/preview/vite";
import { build } from "vite";

export interface BuildOptions {
	/** Project dir to discover targets under (resolved against cwd). */
	dir: string;
	/**
	 * `--targets` value: `true` for the default glob, or a glob/dir string — or a
	 * list of either, which only programmatic callers (`loom-dev/embed`) pass.
	 */
	targets: string | string[] | true;
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

	// Discovery up front so an empty gallery fails the command rather than
	// emitting an empty SPA (the plugin only warns).
	if (findLoomTargets(root, patterns).length === 0) {
		throw new Error(
			`no targets matched ${patterns.join(", ")} under ${root} — nothing to build`,
		);
	}

	await build({
		root,
		base,
		configFile: false, // loom owns the config; ignore any project vite.config
		logLevel: "warn",
		plugins: [loomPreview({ targets: patterns })],
		build: {
			outDir,
			emptyOutDir: true, // outDir is usually outside root; opt in to clearing it
		},
	});

	return outDir;
}
