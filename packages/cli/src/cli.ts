#!/usr/bin/env tsx
/**
 * `loom` CLI — preview a roblox-ts UI project in the browser with zero config.
 *
 *   loom preview [dir] [--port <n>] [--host]
 *
 * It runs a Vite dev server with the loom plugin pre-applied (so no vite.config
 * is needed), generates an index.html when the project has none, and detects a
 * self-mounting client entry. esbuild transpiles the TSX; HMR is built in.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loomPreview } from "@loom-dev/preview/vite";
import { createServer, type Plugin } from "vite";

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

async function preview(
	dir: string,
	port: number,
	host: boolean | string,
): Promise<void> {
	const root = resolve(process.cwd(), dir);
	if (!existsSync(root)) {
		console.error(`loom: directory not found: ${root}`);
		process.exit(1);
	}

	const plugins: Plugin[] = [loomPreview()];
	if (!existsSync(resolve(root, "index.html"))) {
		const entry = findEntry(root);
		if (!entry) {
			console.error(
				`loom: no index.html and no client entry found in ${root}\n` +
					`      looked for: ${ENTRY_CANDIDATES.join(", ")}`,
			);
			process.exit(1);
		}
		plugins.push(loomIndexHtml(entry));
	}

	// esbuild.jsx + optimizeDeps + the @rbxts aliases come from loomPreview().
	const workspaceRoot = findWorkspaceRoot(root);
	const server = await createServer({
		root,
		configFile: false, // loom owns the config; ignore any project vite.config
		plugins,
		server: {
			port,
			host,
			fs: { allow: workspaceRoot ? [root, workspaceRoot] : [root] },
		},
	});
	await server.listen();
	console.log("\n  loom preview\n");
	server.printUrls();
}

function main(): void {
	const args = process.argv.slice(2);
	const cmd = args[0];
	if (cmd !== "preview") {
		console.log(
			"loom — Roblox UI preview\n\n" +
				"Usage:\n  loom preview [dir] [--port <n>] [--host]\n",
		);
		return;
	}
	const dir = args[1] && !args[1].startsWith("-") ? args[1] : ".";

	let port = 5173;
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

	preview(dir, port, host).catch((err) => {
		console.error(err);
		process.exit(1);
	});
}

main();
