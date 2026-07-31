/**
 * The published-package regression test.
 *
 * The reported failure came out of an *installed* loom:
 *
 *     node_modules/loom-dev/node_modules/@loom-dev/preview/src/react-shim.js
 *
 * A workspace test cannot see that path. Workspace links resolve differently
 * from a tarball install, `files` decides what actually ships, and the
 * previewed app's own React (Next 16 pulls React 19) only competes with loom's
 * pinned React 18 once both are real installed packages. So this script does
 * the whole thing for real:
 *
 *   1. build every loom package (tsdown) so `dist/` exists;
 *   2. `pnpm pack` each one into tarballs;
 *   3. create an external Next.js app in a temp directory — no workspace, no
 *      pnpm links — that installs those tarballs with npm;
 *   4. give it gallery targets carrying the exact imports from the reports —
 *      `Component`/`ReactComponent` from `@rbxts/react`, and `HttpService` from
 *      `@rbxts/services` alongside a `Color3.fromHex` theme;
 *   5. run `next build`, which invokes `withLoomGallery`'s static-gallery hook;
 *   6. assert both scenes really are in the emitted static gallery, that the
 *      published preview exports a named `HttpService`, and that the host app's
 *      React 19 never reached it.
 *
 * Run with `pnpm test:packed`. Kept out of `pnpm test` because it installs
 * Next.js from the network and takes minutes, not seconds.
 */
import { execFileSync } from "node:child_process";
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const KEEP = process.argv.includes("--keep");

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

/** A marker the built gallery chunk must contain, proving the scene shipped. */
const SCENE_MARKER = "packed-external-react-class-scene";
/** The same, for the `@rbxts/services` + `Color3.fromHex` scene. */
const HTTP_SCENE_MARKER = "packed-external-http-color-scene";
/** Nothing in the gallery may report React 19 — that is the host app's copy. */
const HOST_REACT = "19.";

function run(command, args, options = {}) {
	process.stdout.write(`\n$ ${command} ${args.join(" ")}\n`);
	execFileSync(command, args, {
		stdio: "inherit",
		cwd: options.cwd ?? REPO,
		env: { ...process.env, ...(options.env ?? {}) },
	});
}

function capture(command, args, cwd) {
	return execFileSync(command, args, { cwd, encoding: "utf8" }).trim();
}

function fail(message) {
	console.error(`\n[packed-next-test] FAIL: ${message}`);
	process.exit(1);
}

// --- 1. build + 2. pack ------------------------------------------------------

const work = mkdtempSync(join(tmpdir(), "loom-packed-"));
const tarballs = join(work, "tarballs");
mkdirSync(tarballs, { recursive: true });
console.log(`[packed-next-test] working in ${work}`);

run("pnpm", ["build:packages"]);

/** `{ "@loom-dev/preview": "/abs/path/to/loom-dev-preview-0.5.1.tgz" }` */
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
	console.log(`[packed-next-test] packed ${name} -> ${file}`);
}

// --- 3. the external app -----------------------------------------------------

const app = join(work, "app");
mkdirSync(app, { recursive: true });

const write = (rel, content) => {
	const file = join(app, rel);
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, content);
};

// The dependency shape of a real external consumer: `loom-dev` only. Everything
// else is transitive, which is what puts the preview at
// `node_modules/loom-dev/node_modules/@loom-dev/preview` — the exact path the
// report's RollupError came from, and a layout workspace links never produce.
//
// The tarballs reference each other by `workspace:*`, which npm cannot resolve,
// so npm `overrides` rewrite those ranges to the same files. Overrides also
// keep every loom package on one copy.
const loomOverrides = Object.fromEntries(
	Object.entries(tarballFor).map(([name, file]) => [name, `file:${file}`]),
);

write(
	"package.json",
	`${JSON.stringify(
		{
			name: "loom-packed-fixture",
			private: true,
			version: "0.0.0",
			scripts: { build: "next build" },
			dependencies: {
				"loom-dev": `file:${tarballFor["loom-dev"]}`,
				next: "16.2.12",
				react: "19.2.0",
				"react-dom": "19.2.0",
			},
			devDependencies: { "@types/react": "19.2.0", typescript: "5.9.2" },
			overrides: loomOverrides,
		},
		null,
		2,
	)}\n`,
);

write(
	"next.config.mjs",
	`import { withLoomGallery } from "loom-dev/next";

// Exactly what an external docs site writes: the gallery lives beside the app
// and \`next build\` emits it statically into public/loom-preview.
export default withLoomGallery(
	{ reactStrictMode: true },
	{ root: "./loom", targets: "targets" },
);
`,
);

write(
	"tsconfig.json",
	`${JSON.stringify(
		{
			compilerOptions: {
				target: "ES2022",
				lib: ["dom", "dom.iterable", "esnext"],
				jsx: "preserve",
				module: "esnext",
				moduleResolution: "bundler",
				strict: true,
				noEmit: true,
				esModuleInterop: true,
				skipLibCheck: true,
				isolatedModules: true,
				resolveJsonModule: true,
				incremental: true,
			},
			include: ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
			exclude: ["node_modules", "loom"],
		},
		null,
		2,
	)}\n`,
);

write(
	"pages/index.tsx",
	`export default function Home() {
	return <main>packed loom fixture</main>;
}
`,
);

// The report's import, verbatim, in a gallery target the static build must
// follow. \`Tag\` and \`Event\` ride along so the renderer-side surface is
// exercised too.
write(
	"loom/targets/ReactClassScene.loom.tsx",
	`import React, {
	Component,
	PureComponent,
	ReactComponent,
	ReactPureComponent,
	createContext,
	createElement,
	createRef,
	forwardRef,
	memo,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "@rbxts/react";

interface CounterState {
	count: number;
}

@ReactComponent
class Counter extends Component<{}, CounterState> {
	state: CounterState = { count: 0 };

	render() {
		return (
			<textbutton
				Name="Counter"
				Size={UDim2.new(1, 0, 0, 36)}
				Text={\`Count: \${this.state.count}\`}
				Tag="${SCENE_MARKER}"
				Event={{
					Activated: () =>
						this.setState((state) => ({ count: state.count + 1 })),
				}}
			/>
		);
	}
}

@ReactPureComponent
class PureLabel extends PureComponent<{ text: string }> {
	render() {
		return <textlabel Name="PureLabel" Text={this.props.text} />;
	}
}

const Theme = createContext("dark");
const Boxed = forwardRef<never, { name: string }>((props, ref) => (
	<frame Name={props.name} ref={ref} />
));
const Memoed = memo(function Memoed() {
	const [seen] = useState("${SCENE_MARKER}");
	const ref = useRef(seen);
	const label = useMemo(() => ref.current, []);
	useEffect(() => {}, []);
	return createElement("textlabel", { Name: "Memoed", Text: label });
});

function Scene() {
	const boxed = createRef<never>();
	return (
		<Theme.Provider value="light">
			<screengui Name="PackedReactClassScene">
				<Counter />
				<PureLabel text="Working" />
				<Boxed name="Boxed" ref={boxed} />
				<Memoed />
			</screengui>
		</Theme.Provider>
	);
}

export const preview = {
	title: "React class compatibility (packed)",
	render: () => <Scene />,
} as const;
`,
);

// The other report: `HttpService` through `@rbxts/services` (a *named* export of
// the published preview bundle, which is where the missing one surfaced as
// "does not provide an export named HttpService") and a `Color3.fromHex` theme.
write(
	"loom/targets/HttpColorScene.loom.tsx",
	`import { HttpService } from "@rbxts/services";

const ACCENT = Color3.fromHex("#6366F1");
const ID = HttpService.GenerateGUID(false);

export const preview = {
	title: "${HTTP_SCENE_MARKER}",
	render: () => (
		<frame
			Name={\`Card-\${ID}\`}
			Size={UDim2.fromOffset(240, 100)}
			BackgroundColor3={ACCENT}
		>
			<textlabel
				Size={UDim2.fromScale(1, 1)}
				BackgroundTransparency={1}
				Text={ID}
				TextColor3={Color3.fromHex("FFFFFF")}
			/>
		</frame>
	),
} as const;
`,
);

// --- 4. install --------------------------------------------------------------

run("npm", ["install", "--no-audit", "--no-fund", "--loglevel", "error"], {
	cwd: app,
});

// The shape from the report: the preview nested under loom-dev, with loom's
// own React beside it rather than the host app's.
const installedPreview = [
	join(app, "node_modules/loom-dev/node_modules/@loom-dev/preview"),
	join(app, "node_modules/@loom-dev/preview"),
].find((dir) => existsSync(dir));
if (!installedPreview) fail("@loom-dev/preview was not installed at all");
console.log(`[packed-next-test] preview installed at ${installedPreview}`);
if (!existsSync(join(installedPreview, "src/compat/react.ts"))) {
	fail(
		"the published @loom-dev/preview has no src/compat/react.ts — the " +
			"compatibility facade is not in the tarball's `files`",
	);
}
if (existsSync(join(installedPreview, "src/react-shim.js"))) {
	fail("the old react-shim.js is still being published");
}
// The `@rbxts/services` alias module as *published*: a named `HttpService`
// export has to be in the tarball, not merely in the workspace source.
const publishedServices = join(installedPreview, "src/services.ts");
if (!existsSync(publishedServices)) {
	fail("the published @loom-dev/preview has no src/services.ts");
}
if (
	!/export const HttpService\b/.test(readFileSync(publishedServices, "utf8"))
) {
	fail(
		"the published @loom-dev/preview exports no named HttpService — " +
			'`import { HttpService } from "@rbxts/services"` cannot link',
	);
}

// --- 5. next build -----------------------------------------------------------

run("npx", ["--no-install", "next", "build"], { cwd: app });

// --- 6. assertions -----------------------------------------------------------

const gallery = join(app, "public/loom-preview");
if (!existsSync(join(gallery, "index.html"))) {
	fail("next build emitted no static gallery at public/loom-preview");
}

const assetsDir = join(gallery, "assets");
const assets = existsSync(assetsDir) ? readdirSync(assetsDir) : [];
const js = assets.filter((f) => f.endsWith(".js"));
if (js.length === 0) fail("the static gallery emitted no JavaScript");

const sceneChunk = js.find((f) => f.startsWith("ReactClassScene"));
if (!sceneChunk) {
	fail(
		`no ReactClassScene chunk in the static gallery (saw: ${js.join(", ")})`,
	);
}

const sceneCode = readFileSync(join(assetsDir, sceneChunk), "utf8");
if (!sceneCode.includes(SCENE_MARKER)) {
	fail("the scene chunk does not contain the scene's own marker");
}

const httpSceneChunk = js.find((f) => f.startsWith("HttpColorScene"));
if (!httpSceneChunk) {
	fail(`no HttpColorScene chunk in the static gallery (saw: ${js.join(", ")})`);
}
const httpSceneCode = readFileSync(join(assetsDir, httpSceneChunk), "utf8");
if (!httpSceneCode.includes(HTTP_SCENE_MARKER)) {
	fail("the HttpService/Color3 chunk does not contain the scene's own marker");
}
if (!httpSceneCode.includes("GenerateGUID")) {
	fail("the HttpService/Color3 chunk never calls GenerateGUID");
}

const allCode = js
	.map((f) => readFileSync(join(assetsDir, f), "utf8"))
	.join("\n");
if (/(from|import|require)\s*\(?\s*["'`]@rbxts\/services["'`]/.test(allCode)) {
	fail("an unresolved @rbxts/services import survived into the gallery bundle");
}
const unresolved = [...allCode.matchAll(/.{0,80}@rbxts\/react.{0,80}/g)].map(
	(m) => m[0],
);
if (
	unresolved.some((hit) =>
		/(from|import|require)\s*\(?\s*["'`]@rbxts\//.test(hit),
	)
) {
	fail(
		`an unresolved @rbxts/react import survived into the gallery bundle:\n  ${unresolved.join("\n  ")}`,
	);
}
if (unresolved.length > 0) {
	console.log(
		`[packed-next-test] note: "@rbxts/react" appears as data, not as an import:\n  ${unresolved.join("\n  ")}`,
	);
}
// React stamps its version into the bundle; the host app's 19 must not be it.
const versions = [...allCode.matchAll(/["'](\d+\.\d+\.\d+)["']/g)]
	.map((m) => m[1])
	.filter((v) => v.startsWith("18.") || v.startsWith(HOST_REACT));
if (versions.some((v) => v.startsWith(HOST_REACT))) {
	fail(`the gallery bundle carries the host app's React ${HOST_REACT}x`);
}
if (!versions.some((v) => v.startsWith("18."))) {
	fail("the gallery bundle does not carry loom's pinned React 18");
}

const indexHtml = readFileSync(join(gallery, "index.html"), "utf8");
if (!indexHtml.includes("loom")) fail("the gallery index.html looks empty");

console.log(`
[packed-next-test] PASS
  tarballs:       ${Object.keys(tarballFor).length}
  gallery chunks: ${sceneChunk}, ${httpSceneChunk}
  fixture:        ${app}
`);

if (KEEP) {
	console.log(`[packed-next-test] keeping ${work} (--keep)`);
	// Copy nothing; the caller inspects it in place.
	void cpSync;
} else {
	rmSync(work, { recursive: true, force: true });
}
