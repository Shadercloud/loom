/**
 * CLI-side gallery glue: turning `--targets` / `--port` flags and an optional
 * `loom.config.ts` into a decision the `loom preview` command can act on, plus
 * the workspace-root probe its `fs.allow` needs.
 *
 * Discovery, codegen and the gallery plugins themselves live in
 * `@loom-dev/preview/gallery` — the Vite plugin owns gallery mode so a plain
 * `vite.config.ts` (`loomPreview({ targets })`) gets exactly what the CLI does.
 * They are re-exported here for the CLI's own consumers (`loom-dev/embed`).
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { normalizeTargetsPatterns } from "@loom-dev/preview/gallery";

export {
	DEFAULT_TARGETS_GLOB,
	findLoomTargets,
	type GalleryParams,
	normalizeTargetsPatterns,
	parseGalleryParams,
	type TargetsInput,
} from "@loom-dev/preview/gallery";

export const DEFAULT_PORT = 5173;

/** Minimal loom.config.ts shape the CLI understands. */
export interface LoomFileConfig {
	targets?: string | string[];
	port?: number;
}

export interface GalleryDecision {
	/** Discovery globs (relative to the project dir); undefined = no gallery mode. */
	patterns?: string[];
	port: number;
	/** Console hint to print (e.g. a legacy config was found and skipped). */
	hint?: string;
}

/**
 * Decide gallery mode from CLI flags + an optional loom.config.ts default
 * export. CLI flags win; the config's `targets`/`port` fill in when flags are
 * absent; a config without a `targets` field (e.g. the legacy lattice shape)
 * is skipped entirely, with a hint.
 */
export function resolveGalleryOptions(input: {
	cliTargets?: string | true;
	cliPort?: number;
	configPresent?: boolean;
	config?: unknown;
}): GalleryDecision {
	const cfg =
		typeof input.config === "object" && input.config !== null
			? (input.config as Record<string, unknown>)
			: undefined;
	const cfgTargets = cfg?.targets;
	const validCfgTargets =
		typeof cfgTargets === "string" ||
		(Array.isArray(cfgTargets) &&
			cfgTargets.length > 0 &&
			cfgTargets.every((t) => typeof t === "string"))
			? (cfgTargets as string | string[])
			: undefined;

	let patterns: string[] | undefined;
	let hint: string | undefined;
	if (input.cliTargets !== undefined) {
		patterns = normalizeTargetsPatterns(input.cliTargets);
	} else if (validCfgTargets !== undefined) {
		patterns = normalizeTargetsPatterns(validCfgTargets);
	} else if (input.configPresent) {
		hint =
			"loom: loom.config.ts found, but its default export has no `targets` field — " +
			"skipping it (legacy config?). Use `--targets [glob]` or export " +
			"`{ targets: string | string[], port?: number }` to enable gallery mode.";
	}

	// Config port only applies when the config itself is a usable new-style
	// config (it has valid targets) — a skipped legacy config is skipped whole.
	const cfgPort =
		validCfgTargets !== undefined && typeof cfg?.port === "number"
			? cfg.port
			: undefined;
	const port = input.cliPort ?? cfgPort ?? DEFAULT_PORT;

	return { patterns, port, hint };
}

/**
 * The pnpm workspace root above a project, if any, so a dev server can read
 * shared workspace assets. Keyed on `pnpm-workspace.yaml` only — `.git` alone is
 * not a signal (it would over-widen `fs.allow` to e.g. a home-dir git repo).
 */
export function findWorkspaceRoot(start: string): string | undefined {
	let dir = start;
	for (let i = 0; i < 24; i++) {
		if (existsSync(resolve(dir, "pnpm-workspace.yaml"))) return dir;
		const parent = resolve(dir, "..");
		if (parent === dir) break;
		dir = parent;
	}
	return undefined;
}
