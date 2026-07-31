// @vitest-environment node
/**
 * One React, even when the previewed project has its own.
 *
 * Loom's renderer is a `react-reconciler@0.29` host config, which only works
 * against React 18; a previewed workspace that hoists React 19 (lattice does)
 * would otherwise win resolution and crash at evaluation on renamed internals.
 * The plugin pins react by absolute-path `resolve.alias`, and the compatibility
 * facade forwards *that* instance — so this fixture plants a hostile React in
 * the project's own `node_modules` and checks that neither the module graph nor
 * the built bundle ever touches it.
 *
 * The consequence if this regressed is not subtle: two Reacts means two hook
 * dispatchers, and every function component throws "Invalid hook call".
 */
import {
	mkdirSync,
	mkdtempSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Rollup } from "vite";
import { afterAll, describe, expect, it } from "vitest";
import { loomPreview } from "../vite.ts";

const PACKAGE_ROOT = resolve(
	fileURLToPath(new URL(".", import.meta.url)),
	"..",
	"..",
);
const ADAPTER_SRC = resolve(PACKAGE_ROOT, "../react/src/index.ts");

const root = realpathSync(mkdtempSync(join(tmpdir(), "loom-react-single-")));
afterAll(() => rmSync(root, { recursive: true, force: true }));

function write(rel: string, code: string): void {
	const file = join(root, rel);
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, code);
}

/** The marker the impostor React would leave in a bundle that resolved to it. */
const IMPOSTOR = "PROJECT_REACT_19_MARKER";

// A React the previewed project hoists for itself, in the shape a real one has.
// Its exports deliberately do not match React 18's, so anything that resolved
// here would also fail loudly rather than merely differ.
write(
	"node_modules/react/package.json",
	JSON.stringify({
		name: "react",
		version: "19.1.0",
		main: "index.js",
		exports: { ".": "./index.js", "./jsx-runtime": "./jsx-runtime.js" },
	}),
);
write(
	"node_modules/react/index.js",
	`export const version = "${IMPOSTOR}";\nexport const Component = "${IMPOSTOR}";\n`,
);
write(
	"node_modules/react/jsx-runtime.js",
	`export const jsx = "${IMPOSTOR}";\nexport const jsxs = "${IMPOSTOR}";\n`,
);

write(
	"tsconfig.json",
	JSON.stringify({
		compilerOptions: {
			target: "ESNext",
			jsx: "react-jsx",
			experimentalDecorators: true,
			useDefineForClassFields: false,
		},
	}),
);

write(
	"src/entry.tsx",
	`import React, { Component, ReactComponent, useState } from "@rbxts/react";
import * as BareReact from "react";
import { useSpring } from "@rbxts/react-ripple";
import { isBinding, mountSync } from "@loom-dev/react";

@ReactComponent
class Counter extends Component<{}, { count: number }> {
	state = { count: 0 };
	render() {
		return <textbutton Name="Counter" Text={\`Count: \${this.state.count}\`} />;
	}
}

function Hooked() {
	// The assertion that matters: a hook running at all means the facade's React
	// and the reconciler's React are the same instance.
	const [label] = useState("hooked");
	const [offset] = useSpring(0);
	return (
		<textlabel
			Name="Hooked"
			Text={label}
			Size={offset.map(() => undefined) as never}
		/>
	);
}

const stubLayout = (root: any) => {
	const rects: Record<string, unknown> = {};
	const walk = (node: any) => {
		rects[node.id ?? "?"] = { rect: { x: 0, y: 0, width: 100, height: 50 } };
		for (const child of node.children ?? []) walk(child);
	};
	walk(root);
	return { rects };
};

/** The versions seen through each import path — they must be one value. */
export const versions = {
	viaDefault: React.version,
	viaBareReact: BareReact.version,
};

/** Ripple's hook and the facade's must mint the same kind of binding. */
export const rippleBindingRecognised = (() => {
	const [binding] = React.createBinding(0);
	return isBinding(binding);
})();

export function mountAll(mount: HTMLElement) {
	return mountSync(
		<screengui Name="Root">
			<Counter />
			<Hooked />
		</screengui>,
		mount,
		{ computeLayout: stubLayout as never },
	);
}
`,
);

function viteConfig() {
	return {
		root,
		configFile: false as const,
		logLevel: "silent" as const,
		plugins: [loomPreview({ html: false })],
		resolve: {
			alias: [{ find: /^@loom-dev\/react$/, replacement: ADAPTER_SRC }],
		},
	};
}

const OUT = join(root, "dist");
let built: Rollup.RollupOutput | undefined;

async function buildOnce(): Promise<Rollup.RollupOutput> {
	if (built) return built;
	const { build } = await import("vite");
	built = (await build({
		...viteConfig(),
		build: {
			outDir: OUT,
			emptyOutDir: true,
			target: "esnext",
			minify: false,
			rollupOptions: {
				input: join(root, "src/entry.tsx"),
				preserveEntrySignatures: "strict",
				output: { format: "es", entryFileNames: "entry.js" },
			},
		},
	})) as Rollup.RollupOutput;
	return built;
}

const chunks = (result: Rollup.RollupOutput): Rollup.OutputChunk[] =>
	result.output.filter(
		(o: Rollup.RollupOutput["output"][number]): o is Rollup.OutputChunk =>
			o.type === "chunk",
	);

describe("a project that hoists its own React", () => {
	it("never resolves to it in development", async () => {
		const { createServer } = await import("vite");
		const server = await createServer({
			...viteConfig(),
			server: { middlewareMode: true },
		});
		try {
			const transformed = await server.transformRequest("/src/entry.tsx");
			expect(transformed?.code).toBeTruthy();
			const ids = [...server.moduleGraph.idToModuleMap.keys()];
			// Nothing under the project's own node_modules/react — neither the
			// package nor an optimizer cache entry for it.
			const projectReact = join(root, "node_modules", "react");
			expect(ids.filter((id) => id.startsWith(projectReact))).toEqual([]);
			expect(
				ids.filter((id) => id.includes("node_modules/.vite/deps")).join("\n"),
			).not.toContain(IMPOSTOR);
		} finally {
			await Promise.race([
				server.close(),
				new Promise((done) => setTimeout(done, 2_000)),
			]);
		}
	});

	it("never bundles it", async () => {
		const result = await buildOnce();
		for (const chunk of chunks(result)) {
			expect(chunk.code, chunk.fileName).not.toContain(IMPOSTOR);
			for (const id of Object.keys(chunk.modules)) {
				expect(id, "resolved into the project's own react").not.toContain(
					join(root, "node_modules", "react"),
				);
			}
		}
	});

	it("reports loom's pinned React through every import path", async () => {
		await buildOnce();
		const mod = (await import(pathToFileURL(join(OUT, "entry.js")).href)) as {
			versions: { viaDefault: string; viaBareReact: string };
			rippleBindingRecognised: boolean;
		};
		expect(mod.versions.viaDefault).toBe(mod.versions.viaBareReact);
		expect(mod.versions.viaDefault).toMatch(/^18\./);
		expect(mod.rippleBindingRecognised).toBe(true);
	});

	it("runs hooks without an invalid-hook-call", async () => {
		await buildOnce();
		const { Window } = await import("happy-dom");
		const win = new Window({ url: "http://localhost/" });
		const globals = globalThis as unknown as Record<string, unknown>;
		for (const key of Object.getOwnPropertyNames(win)) {
			if (key in globals) continue;
			globals[key] = (win as unknown as Record<string, unknown>)[key];
		}
		globals.window = win;
		globals.document = win.document;

		const mod = (await import(pathToFileURL(join(OUT, "entry.js")).href)) as {
			mountAll(mount: HTMLElement): { unmount(): void };
		};
		const mount = document.createElement("div");
		Object.defineProperty(mount, "clientWidth", { value: 800 });
		Object.defineProperty(mount, "clientHeight", { value: 600 });
		document.body.appendChild(mount);
		const world = mod.mountAll(mount);
		try {
			const text = (name: string) =>
				mount.querySelector(`[data-loom-name="${name}"]`)?.textContent;
			expect(text("Counter")).toBe("Count: 0");
			expect(text("Hooked")).toBe("hooked");
		} finally {
			world.unmount();
			mount.remove();
		}
	});
});
