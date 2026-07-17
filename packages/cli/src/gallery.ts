/**
 * Gallery-mode helpers for the loom CLI: target discovery (a dependency-free
 * `**\/*.loom.tsx` glob over the project tree), the `virtual:loom-targets`
 * module codegen, and the CLI-flag/loom.config.ts decision logic. Pure and
 * node-only so each piece is unit-testable without a Vite server.
 */
import { type Dirent, readdirSync } from "node:fs";
import { join, resolve, sep } from "node:path";

/** Glob used when `--targets` is passed without a value (or a bare directory). */
export const DEFAULT_TARGETS_GLOB = "**/*.loom.tsx";

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
 * Compile one glob to a RegExp over posix-style relative paths.
 * Supports `**` (any depth, including none when written `**\/`) and `*`
 * (anything but `/`). Everything else is matched literally.
 */
export function globToRegExp(glob: string): RegExp {
	const GLOBSTAR_SLASH = "\u0001"; // placeholder for `**/`
	const GLOBSTAR = "\u0002"; // placeholder for `**`
	const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&");
	const source = escaped
		.replaceAll("**/", GLOBSTAR_SLASH)
		.replaceAll("**", GLOBSTAR)
		.replaceAll("*", "[^/]*")
		.replaceAll(GLOBSTAR_SLASH, "(?:.*/)?")
		.replaceAll(GLOBSTAR, ".*");
	return new RegExp(`^${source}$`);
}

/**
 * Normalize the `--targets` value (or config `targets`) into discovery globs.
 * `true` (flag without value) → the default glob; a plain directory (no `*`)
 * → `<dir>/**\/*.loom.tsx`; anything with a wildcard is used as-is.
 */
export function normalizeTargetsPatterns(
	value: string | string[] | true,
): string[] {
	const raw =
		value === true
			? [DEFAULT_TARGETS_GLOB]
			: typeof value === "string"
				? [value]
				: value;
	const patterns: string[] = [];
	for (const entry of raw) {
		const cleaned = entry.replace(/^\.\//, "").replace(/\/+$/, "");
		if (cleaned === "" || cleaned === ".") patterns.push(DEFAULT_TARGETS_GLOB);
		else if (cleaned.includes("*")) patterns.push(cleaned);
		else patterns.push(`${cleaned}/${DEFAULT_TARGETS_GLOB}`);
	}
	return patterns;
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
 * Recursively find files under `root` matching any of the globs. Skips
 * `node_modules` and dot-directories. Returns sorted posix-style relative
 * paths.
 */
export function findLoomTargets(root: string, patterns: string[]): string[] {
	const regexes = patterns.map(globToRegExp);
	const found: string[] = [];
	const walk = (dir: string, relPrefix: string): void => {
		let entries: Dirent[];
		try {
			entries = readdirSync(dir, { withFileTypes: true });
		} catch {
			return; // unreadable dir: not fatal for discovery
		}
		for (const entry of entries) {
			if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
			const rel = relPrefix === "" ? entry.name : `${relPrefix}/${entry.name}`;
			if (entry.isDirectory()) walk(join(dir, entry.name), rel);
			else if (entry.isFile() && regexes.some((re) => re.test(rel)))
				found.push(rel);
		}
	};
	walk(root, "");
	return found.sort();
}

/**
 * Emit the `virtual:loom-targets` module body. Each target maps its relative
 * path to a lazy `import()` of the absolute file via Vite's `/@fs/` URL space
 * (so it resolves regardless of the server root). Paths are JSON-escaped.
 */
export function generateTargetsModule(
	root: string,
	relPaths: string[],
): string {
	const entries = relPaths.map((rel) => {
		const abs = resolve(root, ...rel.split("/"))
			.split(sep)
			.join("/");
		return `\t${JSON.stringify(rel)}: () => import(${JSON.stringify(`/@fs${abs}`)}),`;
	});
	return `// generated by loom --targets\nexport const targets = {\n${entries.join("\n")}\n};\n`;
}
