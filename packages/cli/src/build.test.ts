/**
 * What `runBuild` hands the plugin.
 *
 * The options a host passes reach Vite through three wrappers
 * (`withLoomGallery` → `buildGallery` → `runBuild` → `loomPreview`), and an
 * option dropped anywhere along that chain fails silently: the build succeeds,
 * having quietly ignored what it was told. `assets: false` was exactly that
 * until `0.7.1`, so the forwarding is asserted rather than assumed.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const loomPreview = vi.hoisted(() => vi.fn(() => []));
const viteBuild = vi.hoisted(() => vi.fn(async () => undefined));
const findLoomTargets = vi.hoisted(() => vi.fn(() => ["a.loom.tsx"]));

vi.mock("@loom-dev/preview/vite", () => ({ loomPreview }));
vi.mock("vite", () => ({ build: viteBuild, createServer: vi.fn() }));
// Mocked whole rather than partially: the real module reaches for `import.meta.url`
// paths that only resolve when it is loaded as a package entry, and none of that
// is what this file is about.
vi.mock("@loom-dev/preview/gallery", () => ({
	findLoomTargets,
	normalizeTargetsPatterns: (value: unknown) =>
		value === true ? ["**/*.loom.tsx"] : [String(value)],
}));

const { runBuild } = await import("./build.ts");
const { buildGallery } = await import("./embed.ts");

/** The options `loomPreview` was called with on the last build. */
function pluginOptions(): Record<string, unknown> {
	const call = loomPreview.mock.calls.at(-1) as unknown[] | undefined;
	return (call?.[0] ?? {}) as Record<string, unknown>;
}

describe("runBuild", () => {
	beforeEach(() => {
		loomPreview.mockClear();
		viteBuild.mockClear();
	});

	it("bakes assets by default", async () => {
		await runBuild({ dir: ".", targets: true, out: "out" });
		expect(pluginOptions().assets).toBeUndefined();
	});

	it("forwards assets: false to the plugin", async () => {
		await runBuild({ dir: ".", targets: true, out: "out", assets: false });
		expect(pluginOptions().assets).toBe(false);
	});

	it("leaves the plugin alone for assets: true", async () => {
		// `true` is the default, so it is passed as absence rather than as a value
		// the plugin has to re-derive.
		await runBuild({ dir: ".", targets: true, out: "out", assets: true });
		expect(pluginOptions().assets).toBeUndefined();
	});

	it("still forwards shims alongside it", async () => {
		await runBuild({
			dir: ".",
			targets: true,
			out: "out",
			assets: false,
			shims: { "@rbxts/x": "./x.ts" },
		});
		expect(pluginOptions()).toMatchObject({
			assets: false,
			shims: { "@rbxts/x": "./x.ts" },
		});
	});
});

describe("buildGallery", () => {
	beforeEach(() => {
		loomPreview.mockClear();
	});

	it("carries assets: false through the embed wrapper", async () => {
		await buildGallery({ root: ".", outDir: "out", assets: false });
		expect(pluginOptions().assets).toBe(false);
	});

	it("bakes by default, since a static gallery has no server to ask", async () => {
		await buildGallery({ root: ".", outDir: "out" });
		expect(pluginOptions().assets).toBeUndefined();
	});
});
