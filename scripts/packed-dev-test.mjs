/**
 * The installed-**dev-server** regression test.
 *
 * `packed-next-test.mjs` covers a production build of an installed loom. This
 * one covers the other half, which is where #11 lives: the reporter's static
 * deploy renders correctly and `npm run dev` of the same code does not.
 *
 * Only one thing differs between the two, and the plugin says so itself: in a
 * *published install* the react adapter is pre-bundled by Vite's dep optimizer
 * (it imports the CJS `react-reconciler`, and Vite serves an excluded dep's
 * imports raw), while a workspace checkout resolves it to TypeScript source and
 * skips that. Every loom test so far has been a workspace checkout, so the
 * optimizer path has never been exercised at all.
 *
 * It matters because the adapter reaches for `@loom-dev/runtime`, and the whole
 * preview leans on those being *one* module instance: `installGlobals()` puts
 * that copy's `Enum` on `globalThis`, and the adapter then reads enum-valued
 * properties back off live instances. Fold a second copy of the runtime into
 * the optimizer's chunk and the two stop agreeing about what an `EnumItem` is —
 * every `AutomaticSize` read comes back empty, no text is measured, and wrapped
 * text is left frozen at whatever width it first got.
 *
 * So this asserts the shape rather than the symptom: the optimized adapter
 * chunk must not carry its own copy of the runtime.
 *
 * Run with `pnpm test:packed-dev`. Kept out of `pnpm test`: it packs every
 * package and installs from the network.
 */
import { execFileSync, spawn } from "node:child_process";
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const KEEP = process.argv.includes("--keep");
const PORT = 5199;

/** The packages the fixture installs, in dependency order. */
const PACKAGES = [
	"packages/scene",
	"packages/layout",
	"packages/runtime",
	"packages/renderer",
	"packages/react",
	"packages/vide",
	"packages/preview",
	"packages/cli",
];

const run = (cmd, args, cwd = REPO) =>
	execFileSync(cmd, args, { cwd, stdio: "inherit" });
const capture = (cmd, args, cwd = REPO) =>
	execFileSync(cmd, args, { cwd, encoding: "utf8" }).trim();

function fail(message) {
	console.error(`\n[packed-dev-test] FAIL: ${message}`);
	process.exitCode = 1;
	throw new Error(message);
}

const work = mkdtempSync(join(tmpdir(), "loom-packed-dev-"));
const tarballs = join(work, "tarballs");
mkdirSync(tarballs, { recursive: true });
console.log(`[packed-dev-test] working in ${work}`);

run("pnpm", ["build:packages"]);

const tarballFor = {};
for (const dir of PACKAGES) {
	const pkgDir = join(REPO, dir);
	const name = JSON.parse(
		readFileSync(join(pkgDir, "package.json"), "utf8"),
	).name;
	const out = capture(
		"pnpm",
		["pack", "--pack-destination", tarballs, "--silent"],
		pkgDir,
	)
		.split("\n")
		.at(-1);
	const file = out.startsWith("/") ? out : join(tarballs, out);
	if (!existsSync(file)) fail(`pnpm pack produced no tarball for ${name}`);
	tarballFor[name] = file;
}
console.log(`[packed-dev-test] packed ${Object.keys(tarballFor).length}`);

// --- the external app --------------------------------------------------------

const app = join(work, "app");
mkdirSync(app, { recursive: true });
const write = (rel, content) => {
	const file = join(app, rel);
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, content);
};

const loomOverrides = Object.fromEntries(
	Object.entries(tarballFor).map(([name, file]) => [name, `file:${file}`]),
);

write(
	"package.json",
	`${JSON.stringify(
		{
			name: "loom-packed-dev-fixture",
			private: true,
			type: "module",
			dependencies: {
				"loom-dev": `file:${tarballFor["loom-dev"]}`,
				vite: "^7.0.0",
			},
			overrides: loomOverrides,
		},
		null,
		2,
	)}\n`,
);

write(
	"vite.config.mjs",
	`import { defineConfig } from "vite";
import { loomPreview } from "@loom-dev/preview/vite";

export default defineConfig({ plugins: [loomPreview()] });
`,
);

write(
	"index.html",
	`<!doctype html><html><body><div id="loom-root"></div>
<script type="module" src="/src/main.tsx"></script></body></html>
`,
);

write(
	"src/main.tsx",
	`import { createRoot } from "@rbxts/react-roblox";
import { App } from "./App";
createRoot().render(<App />);
`,
);

// The scene lives in `scripts/fixtures/` rather than in a string here: it is
// JSX full of `${}` and backticks, and escaping that through a template literal
// is how you get a fixture nobody can edit.
cpSync(
	join(REPO, "scripts/fixtures/packed-dev-scene.tsx"),
	join(app, "src/App.tsx"),
);

console.log("[packed-dev-test] installing (npm, from the network)…");
run("npm", ["install", "--no-audit", "--no-fund", "--loglevel", "error"], app);

// The adapter must have landed inside node_modules, or the optimizer path this
// test exists for is not the one being taken.
const installedAdapter = join(app, "node_modules/@loom-dev/react/package.json");
if (!existsSync(installedAdapter))
	fail("@loom-dev/react did not install into node_modules");

// --- the dev server ----------------------------------------------------------

console.log("[packed-dev-test] starting the dev server…");
const server = spawn(
	join(app, "node_modules/.bin/vite"),
	["--port", String(PORT), "--strictPort"],
	{ cwd: app, stdio: ["ignore", "pipe", "pipe"] },
);
let log = "";
server.stdout.on("data", (d) => {
	log += d;
});
server.stderr.on("data", (d) => {
	log += d;
});

const stop = () => {
	server.kill("SIGTERM");
	if (!KEEP) rmSync(work, { recursive: true, force: true });
};

try {
	const base = `http://localhost:${PORT}`;
	await waitFor(async () => (await fetch(base)).ok, 60_000, "dev server");
	// Loading the page is what makes Vite optimize the deps it discovers.
	await (await fetch(base)).text();
	await (await fetch(`${base}/src/main.tsx`)).text();
	await waitFor(
		() => existsSync(join(app, "node_modules/.vite/deps/_metadata.json")),
		60_000,
		"dep optimization",
	);

	const metadata = JSON.parse(
		readFileSync(join(app, "node_modules/.vite/deps/_metadata.json"), "utf8"),
	);
	const optimized = Object.keys(metadata.optimized ?? {});
	console.log(`[packed-dev-test] optimized: ${optimized.join(", ") || "none"}`);

	// Any chunk that carries the runtime's own definitions is a second copy of
	// it. `installGlobals` puts one copy's `Enum` on `globalThis`; an adapter
	// reading enum-valued properties back through a *different* copy's
	// `EnumItem` sees nothing it recognises, so every `AutomaticSize` read comes
	// back empty and no text is measured.
	const carriers = [];
	for (const [id, entry] of Object.entries(metadata.optimized ?? {})) {
		if (id === "@loom-dev/runtime") continue;
		const file = join(
			app,
			"node_modules/.vite/deps",
			entry.file.split("/").at(-1),
		);
		if (!existsSync(file)) continue;
		const chunk = readFileSync(file, "utf8");
		if (
			/function installGlobals\b/.test(chunk) ||
			/class EnumItem\b/.test(chunk)
		)
			carriers.push(id);
	}
	if (carriers.length)
		fail(
			`these optimized chunks carry their own copy of @loom-dev/runtime: ` +
				`${carriers.join(", ")} — enum identity splits across the copies, so ` +
				`every AutomaticSize read comes back empty and no text is measured`,
		);
	console.log("[packed-dev-test] OK: no optimized chunk carries the runtime");

	// --- one renderer font registry ------------------------------------------
	//
	// The registry is reached two ways: `@loom-dev/renderer/fonts`, whose import
	// registers the open faces (the preview's globals pull it in), and the
	// `@loom-dev/renderer` root, which is what `@loom-dev/react` measures and
	// paints through. They have to be the same module instance: a second copy
	// would take the registrations *and* the `onFontsChanged` listeners with it,
	// so the faces would be registered into a registry the React world never
	// reads and the world would never re-measure when one loaded. A static build
	// canonicalizes the graph and cannot land there; a dev server, where the
	// subpath and the root are separate requests and the optimizer may rewrite
	// either, can.
	//
	// Asserted over the *served module graph*, not over one file: whether the
	// split comes from an optimized chunk, an alternate URL for the same file, or
	// a symlink resolved two ways, it shows up the same way — as two served
	// modules that each declare the registry.
	const graph = await crawlModuleGraph(base);
	console.log(`[packed-dev-test] crawled ${graph.size} browser modules`);

	// Two independent signals, so this is not one implementation string: the
	// module that *declares* the registry state, and the one that declares the
	// function writing into it. esbuild renames on collision, hence the suffix.
	const declaresState = (src) =>
		/const registrations = (?:\/\* @__PURE__ \*\/ )?new Map\(/.test(src) &&
		/const listeners = (?:\/\* @__PURE__ \*\/ )?new Set\(/.test(src);
	const declaresRegister = (src) => /function registerFont\d*\(/.test(src);

	const registryUrls = [];
	for (const [url, source] of graph) {
		if (declaresState(source) || declaresRegister(source))
			registryUrls.push(url);
	}
	if (registryUrls.length !== 1)
		fail(
			`the browser graph has ${registryUrls.length} copies of the renderer's ` +
				`font registry (expected exactly 1):\n  ${registryUrls.join("\n  ")}\n` +
				`the faces are registered into one and measured through another, so ` +
				`text is measured in the fallback and never re-measured when a face ` +
				`loads`,
		);
	console.log(
		`[packed-dev-test] OK: one font registry — ${registryUrls[0].replace(base, "")}`,
	);

	// And both public entrypoints really do reach *that* module, rather than one
	// of them having been left out of the graph entirely.
	const reachesRegistry = [...graph].filter(
		([url, source]) =>
			(url.includes("open-fonts") || url.includes("renderer/dist/index")) &&
			importsOf(url, source).includes(registryUrls[0]),
	);
	if (reachesRegistry.length < 2)
		fail(
			`only ${reachesRegistry.length} of the renderer's two entrypoints ` +
				`(@loom-dev/renderer and @loom-dev/renderer/fonts) import the font ` +
				`registry module — the other reached a different one`,
		);
	console.log(
		"[packed-dev-test] OK: the renderer root and /fonts share one registry",
	);

	if (KEEP) {
		console.log(`[packed-dev-test] --keep: serving ${base} (ctrl-c to stop)`);
		await new Promise(() => {});
	}
} finally {
	stop();
}

/**
 * Every import specifier in a dev-server-transformed module, resolved against
 * the module's own URL.
 *
 * Vite rewrites every bare specifier to a served URL before the browser sees
 * it, so this is the graph the browser actually builds — which is the level the
 * duplicate-instance question lives at. A `?v=` query is part of the identity
 * (two URLs differing only by it *are* two module instances), so nothing is
 * stripped.
 */
function importsOf(url, source) {
	const out = [];
	const pattern = /(?:from|import)\s*["']([^"']+)["']/g;
	for (const [, spec] of source.matchAll(pattern)) {
		if (spec.startsWith("data:")) continue;
		try {
			const resolved = new URL(spec, url);
			if (resolved.origin === new URL(url).origin) out.push(resolved.href);
		} catch {
			// Not a resolvable specifier (a bare id Vite left alone) — nothing to
			// follow, and nothing that can be a second copy of anything.
		}
	}
	return out;
}

/**
 * The browser's module graph, walked from the page: every served JavaScript
 * module URL mapped to the source the dev server transformed it into.
 *
 * Starts at the HTML, which is where the globals script tag is injected — the
 * one that pulls in `@loom-dev/renderer/fonts`. Without it the crawl would
 * never see the subpath at all, which is exactly the half this test is about.
 */
async function crawlModuleGraph(base) {
	const html = await (await fetch(base)).text();
	const queue = [];
	for (const [, src] of html.matchAll(/<script[^>]+src=["']([^"']+)["']/g)) {
		try {
			queue.push(new URL(src, base).href);
		} catch {
			// A src Vite left as-is and the browser would resolve differently; the
			// modules that matter here are all served ones.
		}
	}
	const graph = new Map();
	// A generous cap, so a graph that somehow cycles into unbounded query
	// variants ends the test rather than the machine.
	while (queue.length > 0 && graph.size < 2000) {
		const url = queue.shift();
		if (graph.has(url)) continue;
		let source;
		try {
			const response = await fetch(url);
			if (!response.ok) continue;
			const type = response.headers.get("content-type") ?? "";
			source = await response.text();
			// CSS and assets are served as JS modules too, and their generated
			// wrappers are not part of this question.
			if (!type.includes("javascript")) continue;
		} catch {
			continue;
		}
		graph.set(url, source);
		queue.push(...importsOf(url, source));
	}
	return graph;
}

async function waitFor(check, timeoutMs, what) {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		try {
			if (await check()) return;
		} catch {
			// not up yet
		}
		if (Date.now() > deadline) {
			console.error(log.slice(-4000));
			fail(`timed out waiting for ${what}`);
		}
		await new Promise((r) => setTimeout(r, 500));
	}
}
