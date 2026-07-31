/**
 * The `basePath` static-export regression test.
 *
 * The reported failure only exists in *generated* output: a Fumadocs site
 * exported to GitHub Pages under `/rbxts-react-clean-ui/` served its gallery
 * HTML fine (Next copies `public/` into the export) while every script, style
 * and runtime URL inside that HTML still pointed at the domain root. Unit tests
 * over the rewrite objects cannot see that — the wrong string is baked into
 * files by Vite — so this script does the whole thing for real:
 *
 *   1. assemble a throwaway project with the reported shape —
 *      `rbxts-react-clean-ui/{docs,src/Scenes}`, a Fumadocs app in `docs/`
 *      composed as `withLoomGallery(withMDX(config), …)`;
 *   2. run a real `next build` with `output: "export"` for three configs:
 *      a `basePath` + `../gallery-demo` gallery, the user's own `root: ".."`
 *      layout, and a control with no `basePath` at all;
 *   3. assert on the exported files: the gallery is in `out/`, its asset URLs
 *      carry the full public base, nothing points at `/loom-preview/…`, every
 *      referenced file exists, and the emitted directory is `public/loom-preview`
 *      (never `public/rbxts-react-clean-ui/…`);
 *   4. serve `out/` under `/rbxts-react-clean-ui/` from a real HTTP server and
 *      fetch the gallery, every resource it references, the scene chunks it
 *      lazily imports, and the `?chrome=none&target=…` deep link — a build that
 *      emits URLs which 404 is exactly the bug being fixed.
 *
 * Run with `pnpm test:base-path`. Kept out of `pnpm test` because it runs three
 * Next builds; it needs no network (the fixture borrows `apps/fumadocs-demo`'s
 * installed node_modules through a symlink).
 */
import { execFileSync } from "node:child_process";
import {
	cpSync,
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	statSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
/** The installed Next/Fumadocs the fixture borrows (no network install). */
const DEMO = join(REPO, "apps", "fumadocs-demo");
const GALLERY_DEMO = join(REPO, "apps", "gallery-demo");
const NEXT_BIN = join(DEMO, "node_modules", "next", "dist", "bin", "next");
const KEEP = process.argv.includes("--keep");
const BASE_PATH = "/rbxts-react-clean-ui";

let failures = 0;

function check(ok, message) {
	if (ok) {
		process.stdout.write(`  ok   ${message}\n`);
	} else {
		failures += 1;
		process.stdout.write(`  FAIL ${message}\n`);
	}
	return ok;
}

function fatal(message) {
	console.error(`\n[next-base-path-test] ${message}`);
	process.exit(1);
}

const MIME = {
	".html": "text/html",
	".js": "text/javascript",
	".mjs": "text/javascript",
	".css": "text/css",
	".wasm": "application/wasm",
	".json": "application/json",
	".txt": "text/plain",
	".svg": "image/svg+xml",
	".png": "image/png",
	".ico": "image/x-icon",
};

/**
 * Serve an exported site below `basePath`, the way GitHub Pages serves a
 * project site. Anything outside the prefix 404s — that is the whole point:
 * a request that "works" only because it fell through to the domain root would
 * hide the bug.
 */
async function serveExport(outDir, basePath) {
	const server = createServer((req, res) => {
		const url = new URL(req.url ?? "/", "http://localhost");
		let pathname = decodeURIComponent(url.pathname);
		if (basePath) {
			if (pathname === basePath) pathname = "/";
			else if (pathname.startsWith(`${basePath}/`))
				pathname = pathname.slice(basePath.length);
			else {
				res.statusCode = 404;
				res.end("outside the base path");
				return;
			}
		}
		const candidates = pathname.endsWith("/")
			? [join(outDir, pathname, "index.html")]
			: [
					join(outDir, pathname),
					join(outDir, `${pathname}.html`),
					join(outDir, pathname, "index.html"),
				];
		for (const file of candidates) {
			if (!existsSync(file) || !statSync(file).isFile()) continue;
			res.statusCode = 200;
			res.setHeader(
				"content-type",
				MIME[extname(file)] ?? "application/octet-stream",
			);
			res.end(readFileSync(file));
			return;
		}
		res.statusCode = 404;
		res.end("not found");
	});
	await new Promise((listening) => server.listen(0, "127.0.0.1", listening));
	const { port } = server.address();
	return {
		origin: `http://127.0.0.1:${port}`,
		close: () => new Promise((closed) => server.close(closed)),
	};
}

/** Root-relative URLs referenced by an HTML document's src/href attributes. */
function localRefs(html) {
	return [
		...new Set(
			[...html.matchAll(/(?:src|href)="([^"]+)"/g)]
				.map((m) => m[1])
				.filter((url) => url.startsWith("/")),
		),
	];
}

// --- the fixture -------------------------------------------------------------

/**
 * `rbxts-react-clean-ui/` — the reported layout, verbatim: a Fumadocs app in
 * `docs/`, roblox-ts source in `src/Scenes/`, and a `gallery-demo` sibling
 * (the workspace one, symlinked) so `root: "../gallery-demo"` is the real
 * multi-target gallery.
 */
function createFixture() {
	// Inside the repo, not the OS temp dir: Turbopack refuses a `node_modules`
	// symlink whose target lies outside the project's filesystem root, and the
	// installed toolchain this fixture borrows lives in `apps/fumadocs-demo`.
	// Dot-prefixed so neither the pnpm workspace globs nor target discovery
	// pick it up; gitignored, and removed again unless `--keep`.
	const tmp = join(REPO, "apps", ".loom-base-path-fixture");
	rmSync(tmp, { recursive: true, force: true });
	const project = join(tmp, "rbxts-react-clean-ui");
	const docs = join(project, "docs");
	for (const dir of [
		join(docs, "app"),
		join(docs, "lib"),
		join(docs, "content", "docs"),
		join(project, "src", "Scenes"),
	]) {
		mkdirSync(dir, { recursive: true });
	}
	// The installed toolchain, borrowed rather than reinstalled. Node resolves
	// through the symlink to the pnpm store, so `next`, `fumadocs-mdx`, `react`
	// and the workspace `loom-dev` all resolve exactly as they do in the demo.
	symlinkSync(join(DEMO, "node_modules"), join(docs, "node_modules"), "dir");

	// The multi-target gallery, as a sibling the way `root: "../gallery-demo"`
	// expects. Copied rather than symlinked (a symlinked workspace app would
	// drag its `extends: "../../tsconfig.base.json"` out of the workspace), with
	// its installed `@rbxts/*` packages borrowed the same way the docs app
	// borrows Next.
	const gallery = join(project, "gallery-demo");
	mkdirSync(gallery, { recursive: true });
	cpSync(join(GALLERY_DEMO, "src"), join(gallery, "src"), { recursive: true });
	symlinkSync(
		join(GALLERY_DEMO, "node_modules"),
		join(gallery, "node_modules"),
		"dir",
	);
	writeFileSync(
		join(gallery, "package.json"),
		`${JSON.stringify({ name: "gallery-demo", version: "0.0.0", private: true, type: "module" }, null, 2)}\n`,
	);
	writeFileSync(
		join(gallery, "tsconfig.json"),
		`${JSON.stringify(
			{
				compilerOptions: {
					target: "ESNext",
					module: "ESNext",
					moduleResolution: "bundler",
					jsx: "react-jsx",
					strict: true,
					noEmit: true,
				},
				include: ["src"],
			},
			null,
			2,
		)}\n`,
	);

	writeFileSync(
		join(docs, "package.json"),
		`${JSON.stringify(
			{ name: "loom-base-path-docs", version: "0.0.0", private: true },
			null,
			2,
		)}\n`,
	);
	cpSync(join(DEMO, "tsconfig.json"), join(docs, "tsconfig.json"));
	writeFileSync(
		join(docs, "source.config.ts"),
		'import { defineDocs } from "fumadocs-mdx/config";\n' +
			'export const docs = defineDocs({ dir: "content/docs" });\n',
	);
	// The project-level constant a literal MDX/JSX iframe src has to go through:
	// nothing prefixes a raw string with the basePath.
	writeFileSync(
		join(docs, "lib", "site-config.ts"),
		'export const siteBasePath =\n\tprocess.env.NODE_ENV === "production" ? "/rbxts-react-clean-ui" : "";\n' +
			"export function loomPreviewUrl(target: string): string {\n" +
			// Concatenated, not a template literal: this is generated source, and
			// a `${…}` inside it would be interpolated here instead.
			'\treturn siteBasePath + "/loom-preview/?chrome=none&target=" + target;\n' +
			"}\n",
	);
	writeFileSync(
		join(docs, "app", "layout.tsx"),
		"export default function RootLayout({ children }: { children: React.ReactNode }) {\n" +
			'\treturn (\n\t\t<html lang="en">\n\t\t\t<body>{children}</body>\n\t\t</html>\n\t);\n}\n',
	);
	writeFileSync(
		join(docs, "app", "page.tsx"),
		'import { loomPreviewUrl } from "@/lib/site-config";\n\n' +
			"export default function Home() {\n" +
			"\treturn (\n" +
			"\t\t<main>\n" +
			"\t\t\t<h1>rbxts-react-clean-ui</h1>\n" +
			'\t\t\t<iframe title="loom" src={loomPreviewUrl("src/targets/CardScene.loom.tsx")} />\n' +
			"\t\t</main>\n\t);\n}\n",
	);
	writeFileSync(
		join(docs, "content", "docs", "index.mdx"),
		"---\ntitle: Hello\ndescription: fixture\n---\n\nA loom scene lives at the gallery mount.\n",
	);
	// The user's own scene, for the `root: ".."` case.
	writeFileSync(
		join(project, "src", "Scenes", "Button.loom.tsx"),
		'import React from "@rbxts/react";\n\n' +
			"function Button({ text }: { text: string }) {\n" +
			"\treturn <textlabel Text={text} Size={new UDim2(0, 200, 0, 50)} />;\n" +
			"}\n\n" +
			"export const preview = {\n" +
			'\trender: () => <Button text="Hello World" />,\n' +
			'\ttitle: "Button",\n' +
			"} as const;\n",
	);
	return { tmp, project, docs };
}

/** The `next.config.mjs` under test — the reported one, parameterized. */
function nextConfig({ basePath, root, targets }) {
	return (
		'import { createMDX } from "fumadocs-mdx/next";\n' +
		'import { withLoomGallery } from "loom-dev/next";\n\n' +
		"const withMDX = createMDX();\n" +
		'const isProduction = process.env.NODE_ENV === "production";\n\n' +
		'/** @type {import("next").NextConfig} */\n' +
		"const config = {\n" +
		'\toutput: "export",\n' +
		`\tbasePath: isProduction ? ${JSON.stringify(basePath)} : "",\n` +
		"\timages: {\n\t\tunoptimized: true,\n\t},\n" +
		"};\n\n" +
		"export default withLoomGallery(withMDX(config), {\n" +
		`\troot: ${JSON.stringify(root)},\n` +
		(targets ? `\ttargets: ${JSON.stringify(targets)},\n` : "") +
		"});\n"
	);
}

// --- the cases ---------------------------------------------------------------

const CASES = [
	{
		name: "gallery-demo targets, exported under /rbxts-react-clean-ui",
		config: {
			basePath: BASE_PATH,
			root: "../gallery-demo",
			targets: "src/targets",
		},
		publicBase: `${BASE_PATH}/loom-preview/`,
		basePath: BASE_PATH,
		deepLinkTarget: "src/targets/CardScene.loom.tsx",
	},
	{
		name: "the reported layout: docs/ app with root '..'",
		config: { basePath: BASE_PATH, root: ".." },
		publicBase: `${BASE_PATH}/loom-preview/`,
		basePath: BASE_PATH,
		deepLinkTarget: "src/Scenes/Button.loom.tsx",
	},
	{
		name: "control: the same site with no basePath",
		config: { basePath: "", root: "../gallery-demo", targets: "src/targets" },
		publicBase: "/loom-preview/",
		basePath: "",
		deepLinkTarget: "src/targets/CardScene.loom.tsx",
	},
];

async function runCase(fixture, testCase) {
	process.stdout.write(`\n=== ${testCase.name} ===\n`);
	const { docs } = fixture;
	// A build is only trustworthy if nothing survived the previous one.
	for (const dir of ["out", ".next", "public", ".source"]) {
		rmSync(join(docs, dir), { recursive: true, force: true });
	}
	writeFileSync(join(docs, "next.config.mjs"), nextConfig(testCase.config));
	// Next's own entry, not the `.bin/next` shim: that shim is a relative
	// symlink, and following it from the borrowed node_modules lands outside
	// the fixture. `cwd` is what decides which app is built either way.
	execFileSync(process.execPath, [NEXT_BIN, "build"], {
		cwd: docs,
		stdio: "inherit",
		env: { ...process.env, NODE_ENV: "production" },
	});

	const out = join(docs, "out");
	const publicDir = join(docs, "public");
	const { publicBase, basePath } = testCase;

	// 1. the gallery reached the export, from its usual `public/` home
	check(
		existsSync(join(publicDir, "loom-preview", "index.html")),
		"emitted to public/loom-preview",
	);
	check(
		!existsSync(join(publicDir, "rbxts-react-clean-ui")),
		"no public/rbxts-react-clean-ui — the basePath is not a directory",
	);
	if (
		!check(
			existsSync(join(out, "loom-preview", "index.html")),
			"exported to out/loom-preview",
		)
	)
		return;

	// 2/3. every URL in the gallery document carries the full public base
	const html = readFileSync(join(out, "loom-preview", "index.html"), "utf8");
	const refs = localRefs(html);
	check(
		refs.length > 0,
		`gallery html references ${refs.length} local resources`,
	);
	check(
		refs.every((url) => url.startsWith(publicBase)),
		`every reference starts with ${publicBase}`,
	);
	if (basePath) {
		check(
			!refs.some((url) => url.startsWith("/loom-preview/")),
			"no reference falls back to the domain root /loom-preview/",
		);
	}

	// 4. …and the file each one names really is in the export
	const missing = refs.filter(
		(url) => !existsSync(join(out, url.slice(basePath.length))),
	);
	check(
		missing.length === 0,
		`every referenced file exists (${missing.join(", ")})`,
	);

	// 5. runtime URLs baked into the entry chunk (the wasm layout engine is an
	//    absolute one) and the lazily imported scene chunks
	const entry = refs.find((url) => url.endsWith(".js"));
	const entryCode = readFileSync(
		join(out, entry.slice(basePath.length)),
		"utf8",
	);
	const absolute = [
		...new Set(
			[
				...entryCode.matchAll(
					/["'`](\/[^"'`\s]*loom-preview\/[^"'`\s]*)["'`]/g,
				),
			].map((m) => m[1]),
		),
	];
	check(
		absolute.length > 0 && absolute.every((url) => url.startsWith(publicBase)),
		`runtime URLs in the entry chunk use the public base (${absolute.join(", ")})`,
	);
	const chunkDir = dirname(join(out, entry.slice(basePath.length)));
	const dynamic = [
		...new Set(
			[...entryCode.matchAll(/import\(["'`](\.\/[^"'`]+)["'`]\)/g)].map(
				(m) => m[1],
			),
		),
	];
	check(
		dynamic.length > 0,
		`entry chunk lazily imports ${dynamic.length} scene chunks`,
	);
	check(
		entryCode.includes(testCase.deepLinkTarget),
		`the deep link's target (${testCase.deepLinkTarget}) is in the generated target map`,
	);
	check(
		dynamic.every((spec) => existsSync(join(chunkDir, spec))),
		"every lazily imported chunk exists next to the entry chunk",
	);

	// 6. the page's iframe src — a literal string that only the project-level
	//    constant keeps in sync with the deployment prefix
	const page = join(out, "index.html");
	if (existsSync(page)) {
		check(
			readFileSync(page, "utf8").includes(
				`${publicBase}?chrome=none&amp;target=src/targets/CardScene.loom.tsx`,
			) ||
				readFileSync(page, "utf8").includes(
					`${publicBase}?chrome=none&target=src/targets/CardScene.loom.tsx`,
				),
			`the exported page's iframe points at ${publicBase}`,
		);
	}

	// 7. serve it the way GitHub Pages would and fetch everything for real
	const server = await serveExport(out, basePath);
	try {
		const galleryUrl = `${server.origin}${publicBase}`;
		const response = await fetch(galleryUrl);
		check(response.status === 200, `GET ${publicBase} → ${response.status}`);
		const served = await response.text();
		const results = await Promise.all(
			localRefs(served).map(async (url) => [
				url,
				(await fetch(`${server.origin}${url}`)).status,
			]),
		);
		const bad = results.filter(([, status]) => status !== 200);
		check(
			bad.length === 0,
			`every referenced resource served 200 (${bad.map(([u, s]) => `${u} → ${s}`).join(", ")})`,
		);

		// The scene chunks are relative imports, so the browser resolves them
		// against the entry chunk's own URL — which is only under the deployment
		// prefix if the entry URL itself was.
		const chunkBase = entry.slice(0, entry.lastIndexOf("/"));
		const chunkResults = await Promise.all(
			dynamic.map(async (spec) => [
				spec,
				(await fetch(`${server.origin}${chunkBase}/${spec.slice(2)}`)).status,
			]),
		);
		const badChunks = chunkResults.filter(([, status]) => status !== 200);
		check(
			badChunks.length === 0,
			`every scene chunk served 200 under the base path (${badChunks.map(([u, s]) => `${u} → ${s}`).join(", ")})`,
		);

		// The absolute runtime URLs the chunk builds at run time — the wasm layout
		// engine among them — are the ones that 404'd at the domain root.
		const runtime = await Promise.all(
			absolute
				.filter((url) => url !== publicBase)
				.map(async (url) => [
					url,
					(await fetch(`${server.origin}${url}`)).status,
				]),
		);
		const badRuntime = runtime.filter(([, status]) => status !== 200);
		check(
			runtime.length > 0 && badRuntime.length === 0,
			`every runtime URL served 200 (${badRuntime.map(([u, s]) => `${u} → ${s}`).join(", ")})`,
		);

		const deepLink = `${galleryUrl}?chrome=none&target=${testCase.deepLinkTarget}`;
		const deep = await fetch(deepLink);
		check(deep.status === 200, `GET the deep link → ${deep.status}`);

		if (basePath) {
			const stray = await fetch(`${server.origin}/loom-preview/`);
			check(
				stray.status === 404,
				`the domain-root gallery is genuinely absent (${stray.status})`,
			);
		}
	} finally {
		await server.close();
	}
}

// --- run ---------------------------------------------------------------------

if (!existsSync(NEXT_BIN)) {
	fatal(`apps/fumadocs-demo is not installed — run \`pnpm install\` first`);
}

const fixture = createFixture();
process.stdout.write(`fixture: ${fixture.project}\n`);
try {
	for (const testCase of CASES) await runCase(fixture, testCase);
} finally {
	if (KEEP) process.stdout.write(`\nkept: ${fixture.tmp}\n`);
	else rmSync(fixture.tmp, { recursive: true, force: true });
}

if (failures > 0) {
	fatal(`${failures} check(s) failed`);
}
process.stdout.write("\n[next-base-path-test] all checks passed\n");
