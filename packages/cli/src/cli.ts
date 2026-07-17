#!/usr/bin/env tsx
/**
 * `loom` CLI — preview a roblox-ts UI project in the browser with zero config.
 *
 *   loom preview [dir] [--port <n>] [--host] [--targets [glob]]
 *
 * It runs a Vite dev server with the loom plugin pre-applied (so no vite.config
 * is needed), generates an index.html when the project has none, and detects a
 * self-mounting client entry. esbuild transpiles the TSX; HMR is built in.
 *
 * `--targets` switches to gallery mode: every `**\/*.loom.tsx` under the dir
 * (or the given glob/directory) is listed in a sidebar shell with lazy mounts
 * and per-target error containment. A minimal `<dir>/loom.config.ts` exporting
 * `{ targets?: string | string[], port?: number }` is honored when the flags
 * are absent.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loomPreview } from "@loom-dev/preview/vite";
import { createServer, type Plugin, type PluginOption } from "vite";
import { resolveGalleryOptions } from "./gallery";
import {
	LOOM_REPO_ROOT,
	loomGallery,
	loomGalleryIndexHtml,
} from "./gallery-plugin";

// roblox-ts client-entry conventions, in priority order.
const ENTRY_CANDIDATES = [
	"src/main.client.tsx",
	"src/main.client.ts",
	"src/client/main.client.tsx",
	"src/client/main.client.ts",
	"src/main.tsx",
	"src/main.ts",
	"src/index.tsx",
	"src/client.tsx",
];

function findEntry(root: string): string | undefined {
	for (const candidate of ENTRY_CANDIDATES) {
		if (existsSync(resolve(root, candidate))) return `/${candidate}`;
	}
	return undefined;
}

/**
 * The pnpm workspace root above the project, if any, so the dev server can read
 * shared workspace assets. Keyed on `pnpm-workspace.yaml` only — `.git` alone is
 * not a signal (it would over-widen `fs.allow` to e.g. a home-dir git repo).
 */
function findWorkspaceRoot(start: string): string | undefined {
	let dir = start;
	for (let i = 0; i < 24; i++) {
		if (existsSync(resolve(dir, "pnpm-workspace.yaml"))) return dir;
		const parent = resolve(dir, "..");
		if (parent === dir) break;
		dir = parent;
	}
	return undefined;
}

/** Serve a generated index.html (with the loom mount point) when none exists. */
function loomIndexHtml(entryUrl: string): Plugin {
	const html = `<!doctype html>
<html lang="en">
	<head>
		<meta charset="UTF-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1.0" />
		<title>loom preview</title>
		<style>
			html, body { margin: 0; height: 100%; background: #14161a; }
			#loom-root { position: relative; width: 100vw; height: 100vh; overflow: hidden; }
		</style>
	</head>
	<body>
		<div id="loom-root"></div>
		<script type="module" src="${entryUrl}"></script>
	</body>
</html>`;
	return {
		name: "loom:index-html",
		configureServer(server) {
			return () => {
				server.middlewares.use(async (req, res, next) => {
					const url = (req.url ?? "/").split("?")[0];
					if (url !== "/" && url !== "/index.html") return next();
					try {
						const out = await server.transformIndexHtml(
							url,
							html,
							req.originalUrl,
						);
						res.statusCode = 200;
						res.setHeader("Content-Type", "text/html");
						res.end(out);
					} catch (err) {
						next(err);
					}
				});
			};
		},
	};
}

/**
 * Import `<root>/loom.config.ts` (tsx's loader handles the TS) and return its
 * default export, plus whether the file existed at all. Import failures are
 * downgraded to a warning — a broken config never blocks plain preview mode.
 */
async function loadLoomConfig(
	root: string,
): Promise<{ present: boolean; config?: unknown }> {
	const configPath = resolve(root, "loom.config.ts");
	if (!existsSync(configPath)) return { present: false };
	try {
		const mod = (await import(pathToFileURL(configPath).href)) as {
			default?: unknown;
		};
		return { present: true, config: mod.default };
	} catch (err) {
		console.warn(`loom: failed to load ${configPath} — ignoring it\n  ${err}`);
		return { present: true };
	}
}

async function preview(
	dir: string,
	options: {
		port?: number;
		host: boolean | string;
		targets?: string | true;
	},
): Promise<void> {
	const root = resolve(process.cwd(), dir);
	if (!existsSync(root)) {
		console.error(`loom: directory not found: ${root}`);
		process.exit(1);
	}

	const { present: configPresent, config } = await loadLoomConfig(root);
	const decision = resolveGalleryOptions({
		cliTargets: options.targets,
		cliPort: options.port,
		configPresent,
		config,
	});
	if (decision.hint) console.warn(decision.hint);

	const plugins: PluginOption[] = [loomPreview()];
	if (decision.patterns) {
		// Gallery mode: no client entry needed — the shell mounts targets itself.
		plugins.push(loomGallery(decision.patterns), loomGalleryIndexHtml());
	} else if (!existsSync(resolve(root, "index.html"))) {
		const entry = findEntry(root);
		if (!entry) {
			console.error(
				`loom: no index.html and no client entry found in ${root}\n` +
					`      looked for: ${ENTRY_CANDIDATES.join(", ")}\n` +
					`      (or pass --targets to browse *.loom.tsx files as a gallery)`,
			);
			process.exit(1);
		}
		plugins.push(loomIndexHtml(entry));
	}

	// esbuild.jsx + optimizeDeps + the @rbxts aliases come from loomPreview().
	// fs.allow includes the loom repo itself: the gallery shell (and, for
	// projects outside this workspace, the linked @loom-dev sources) are served
	// from it via /@fs/ URLs.
	const workspaceRoot = findWorkspaceRoot(root);
	const fsAllow = [...new Set([root, workspaceRoot, LOOM_REPO_ROOT])].filter(
		(p): p is string => typeof p === "string",
	);
	const server = await createServer({
		root,
		configFile: false, // loom owns the config; ignore any project vite.config
		plugins,
		server: {
			port: decision.port,
			host: options.host,
			fs: { allow: fsAllow },
		},
	});
	await server.listen();
	console.log(decision.patterns ? "\n  loom gallery\n" : "\n  loom preview\n");
	server.printUrls();
}

function main(): void {
	const args = process.argv.slice(2);
	const cmd = args[0];
	if (cmd !== "preview") {
		console.log(
			"loom — Roblox UI preview\n\n" +
				"Usage:\n  loom preview [dir] [--port <n>] [--host] [--targets [glob]]\n",
		);
		return;
	}
	const dir = args[1] && !args[1].startsWith("-") ? args[1] : ".";

	// Left undefined when the flag is absent so loom.config.ts can fill it in.
	let port: number | undefined;
	const portIdx = args.indexOf("--port");
	if (portIdx >= 0) {
		const raw = args[portIdx + 1];
		if (!raw || !/^\d+$/.test(raw)) {
			console.error("loom: --port requires a numeric value");
			process.exit(1);
		}
		port = Number(raw);
	}

	// --host is a boolean (bind all interfaces) unless followed by an address.
	let host: boolean | string = false;
	const hostIdx = args.indexOf("--host");
	if (hostIdx >= 0) {
		const raw = args[hostIdx + 1];
		host = raw && !raw.startsWith("-") ? raw : true;
	}

	// --targets is a boolean (default glob **/*.loom.tsx) unless followed by a
	// glob or directory, both relative to [dir].
	let targets: string | true | undefined;
	const targetsIdx = args.indexOf("--targets");
	if (targetsIdx >= 0) {
		const raw = args[targetsIdx + 1];
		targets = raw && !raw.startsWith("-") ? raw : true;
	}

	preview(dir, { port, host, targets }).catch((err) => {
		console.error(err);
		process.exit(1);
	});
}

main();
