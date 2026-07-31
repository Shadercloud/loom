// @vitest-environment node
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
	createLoomRewrites,
	loomDevRewrites,
	loomStaticRewrites,
	mergeRewrites,
	type NextRewritesResult,
	PHASE_PRODUCTION_BUILD,
	staticGalleryOutDir,
	withLoomGallery,
} from "./next.ts";

const BASE = "/loom-preview/";
const ORIGIN = "http://127.0.0.1:4300";

describe("loomDevRewrites", () => {
	it("maps the bare mount straight to the slashed upstream URL", () => {
		const [bare, catchAll] = loomDevRewrites(BASE, ORIGIN);
		expect(bare).toEqual({
			source: "/loom-preview",
			destination: `${ORIGIN}/loom-preview/`,
		});
		expect(catchAll).toEqual({
			source: "/loom-preview/:path*",
			destination: `${ORIGIN}/loom-preview/:path*`,
		});
	});
});

describe("loomStaticRewrites", () => {
	it("maps the bare mount onto the built index.html", () => {
		expect(loomStaticRewrites(BASE)).toEqual([
			{ source: "/loom-preview", destination: "/loom-preview/index.html" },
		]);
	});
});

describe("mergeRewrites", () => {
	const loomRule = { source: "/loom-preview", destination: "x" };

	it("builds groups from a missing user rewrites", () => {
		expect(mergeRewrites(undefined, { beforeFiles: [loomRule] })).toEqual({
			beforeFiles: [loomRule],
			afterFiles: [],
			fallback: [],
		});
	});

	it("treats a flat user array as afterFiles", () => {
		const user = [{ source: "/a", destination: "/b" }];
		const merged = mergeRewrites(user, { afterFiles: [loomRule] });
		expect(merged.beforeFiles).toEqual([]);
		expect(merged.afterFiles).toEqual([loomRule, ...user]);
	});

	it("layers loom rules in front of grouped user rules", () => {
		const user = {
			beforeFiles: [{ source: "/ub", destination: "/1" }],
			afterFiles: [{ source: "/ua", destination: "/2" }],
			fallback: [{ source: "/uf", destination: "/3" }],
		};
		const merged = mergeRewrites(user, {
			beforeFiles: [loomRule],
			afterFiles: [loomRule],
		});
		expect(merged.beforeFiles).toEqual([loomRule, ...user.beforeFiles]);
		expect(merged.afterFiles).toEqual([loomRule, ...user.afterFiles]);
		expect(merged.fallback).toEqual(user.fallback);
	});
});

describe("createLoomRewrites", () => {
	it("adds only the static rule (and boots nothing) outside dev", async () => {
		const ensureServer = vi.fn();
		const rewrites = createLoomRewrites(undefined, BASE, {
			dev: false,
			ensureServer,
		});
		const result = await rewrites();
		expect(ensureServer).not.toHaveBeenCalled();
		expect(result.beforeFiles).toEqual([]);
		expect(result.afterFiles).toEqual(loomStaticRewrites(BASE));
	});

	it("boots the gallery and proxies to its origin in dev", async () => {
		const ensureServer = vi.fn().mockResolvedValue({ origin: ORIGIN });
		const rewrites = createLoomRewrites(undefined, BASE, {
			dev: true,
			ensureServer,
		});
		const result = await rewrites();
		expect(result.beforeFiles).toEqual(loomDevRewrites(BASE, ORIGIN));
		expect(result.afterFiles).toEqual([]);
	});

	it("keeps the user's rewrites when the gallery fails to boot", async () => {
		const error = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);
		const user = async (): Promise<NextRewritesResult> => [
			{ source: "/a", destination: "/b" },
		];
		const rewrites = createLoomRewrites(user, BASE, {
			dev: true,
			ensureServer: vi.fn().mockRejectedValue(new Error("port busy")),
		});
		const result = await rewrites();
		expect(result.beforeFiles).toEqual([]);
		expect(result.afterFiles).toEqual([{ source: "/a", destination: "/b" }]);
		expect(error).toHaveBeenCalledOnce();
		error.mockRestore();
	});

	it("awaits an async grouped user rewrites", async () => {
		const user = async (): Promise<NextRewritesResult> => ({
			beforeFiles: [{ source: "/ub", destination: "/1" }],
		});
		const rewrites = createLoomRewrites(user, BASE, {
			dev: true,
			ensureServer: vi.fn().mockResolvedValue({ origin: ORIGIN }),
		});
		const result = await rewrites();
		expect(result.beforeFiles).toEqual([
			...loomDevRewrites(BASE, ORIGIN),
			{ source: "/ub", destination: "/1" },
		]);
	});
});

describe("staticGalleryOutDir", () => {
	it("maps the base under public/", () => {
		expect(staticGalleryOutDir("/loom-preview/")).toBe("public/loom-preview");
		expect(staticGalleryOutDir("/a/b/")).toBe(join("public", "a", "b"));
	});
});

describe("withLoomGallery", () => {
	it("preserves the rest of the config and normalizes the base", async () => {
		// A serve phase: the one branch safe to resolve without a Vite server
		// (dev boots one lazily, the build phase emits the static gallery).
		const config = await withLoomGallery(
			{ reactStrictMode: true },
			{ root: ".", base: "previews" },
		)("phase-production-server", {});
		expect(config.reactStrictMode).toBe(true);
		const rewrites = (
			config as unknown as { rewrites: () => Promise<NextRewritesResult> }
		).rewrites;
		expect(await rewrites()).toMatchObject({
			afterFiles: [
				{ source: "/previews", destination: "/previews/index.html" },
			],
		});
	});

	it("composes a function-form user config, forwarding the phase", async () => {
		const user = vi.fn().mockResolvedValue({ poweredByHeader: false });
		const context = { defaultConfig: {} };
		const config = await withLoomGallery(user, { root: "." })(
			"phase-production-server",
			context,
		);
		expect(user).toHaveBeenCalledWith("phase-production-server", context);
		expect(config.poweredByHeader).toBe(false);
	});

	it("skips the build-phase static build when the marker is set", async () => {
		// The marker is how worker processes (which re-evaluate the config with
		// the same phase) avoid rebuilding: with it preset, the build phase must
		// resolve without discovering targets or invoking Vite.
		process.env.LOOM_NEXT_GALLERY_BUILT = "/loom-preview/";
		try {
			const config = await withLoomGallery({}, { root: "." })(
				PHASE_PRODUCTION_BUILD,
				{},
			);
			const rewrites = (
				config as unknown as { rewrites: () => Promise<NextRewritesResult> }
			).rewrites;
			expect(await rewrites()).toMatchObject({
				afterFiles: loomStaticRewrites("/loom-preview/"),
			});
		} finally {
			delete process.env.LOOM_NEXT_GALLERY_BUILT;
		}
	});

	it("skips the static build entirely with staticBuild: false", async () => {
		// root points at a directory with no node_modules and no targets; a real
		// build attempt would warn-and-skip, but with the opt-out the phase must
		// not even reach discovery — no marker is written.
		await withLoomGallery({}, { root: ".", staticBuild: false })(
			PHASE_PRODUCTION_BUILD,
			{},
		);
		expect(process.env.LOOM_NEXT_GALLERY_BUILT).toBeUndefined();
	});
});
