// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { generateTargetsModule, toViteFsUrl } from "@loom-dev/preview/gallery";
import { afterAll, describe, expect, it, vi } from "vitest";
import {
	composeGalleryPublicBase,
	createLoomRewrites,
	type GalleryBases,
	galleryBuildMarker,
	loomDevRewrites,
	loomStaticRewrites,
	mergeRewrites,
	type NextRewritesResult,
	normalizeNextBasePath,
	PHASE_PRODUCTION_BUILD,
	resolveGalleryBases,
	resolveLoomNextOptions,
	staticGalleryOutDir,
	withLoomGallery,
} from "./next.ts";

const BASE = "/loom-preview/";
/** No Next `basePath`: the mount and the public base are the same string. */
const BASES: GalleryBases = { mountBase: BASE, publicBase: BASE };
const ORIGIN = "http://127.0.0.1:4300";

describe("normalizeNextBasePath", () => {
	it("collapses every 'no base path' spelling to the empty string", () => {
		expect(normalizeNextBasePath(undefined)).toBe("");
		expect(normalizeNextBasePath("")).toBe("");
		expect(normalizeNextBasePath("/")).toBe("");
	});

	it("keeps a path base and drops its trailing slash", () => {
		expect(normalizeNextBasePath("/docs")).toBe("/docs");
		expect(normalizeNextBasePath("/docs/")).toBe("/docs");
		expect(normalizeNextBasePath("/rbxts-react-clean-ui")).toBe(
			"/rbxts-react-clean-ui",
		);
		expect(normalizeNextBasePath("/a/b/")).toBe("/a/b");
	});

	it("repairs malformed input rather than emitting an invalid URL", () => {
		expect(normalizeNextBasePath("docs")).toBe("/docs");
		expect(normalizeNextBasePath("//docs//sub//")).toBe("/docs/sub");
		expect(normalizeNextBasePath("  /docs  ")).toBe("/docs");
		expect(normalizeNextBasePath(42)).toBe("");
		expect(normalizeNextBasePath(null)).toBe("");
	});

	it("ignores an origin — that is assetPrefix's job, not basePath's", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		expect(normalizeNextBasePath("https://cdn.example.com/docs")).toBe("");
		expect(warn).toHaveBeenCalledOnce();
		warn.mockRestore();
	});
});

describe("composeGalleryPublicBase", () => {
	it("is the mount base itself when the app has no base path", () => {
		expect(composeGalleryPublicBase("", BASE)).toBe("/loom-preview/");
	});

	it("prefixes the deployment base path", () => {
		expect(composeGalleryPublicBase("/rbxts-react-clean-ui", BASE)).toBe(
			"/rbxts-react-clean-ui/loom-preview/",
		);
	});

	it("normalizes both sides before composing", () => {
		expect(composeGalleryPublicBase("/docs/", "previews")).toBe(
			"/docs/previews/",
		);
	});

	it("always yields one leading and one trailing slash, and no backslash", () => {
		for (const [nextBasePath, mount] of [
			["", BASE],
			["/", "loom-preview"],
			["/docs/", "/previews"],
			["docs//", "previews//"],
			["/rbxts-react-clean-ui", BASE],
		] as const) {
			const composed = composeGalleryPublicBase(nextBasePath, mount);
			expect(composed.startsWith("/")).toBe(true);
			expect(composed.startsWith("//")).toBe(false);
			expect(composed.endsWith("/")).toBe(true);
			expect(composed.endsWith("//")).toBe(false);
			expect(composed).not.toContain("//");
			expect(composed).not.toContain("\\");
		}
	});
});

describe("resolveGalleryBases", () => {
	it("keeps the mount relative to the app and the public base deployed", () => {
		expect(resolveGalleryBases("/docs", "previews")).toEqual({
			mountBase: "/previews/",
			publicBase: "/docs/previews/",
		});
		expect(resolveGalleryBases(undefined, undefined)).toEqual({
			mountBase: BASE,
			publicBase: BASE,
		});
	});

	it("warns when a loom base repeats the Next base path", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		expect(resolveGalleryBases("/docs", "/docs/loom-preview/")).toEqual({
			mountBase: "/docs/loom-preview/",
			publicBase: "/docs/docs/loom-preview/",
		});
		expect(warn).toHaveBeenCalledOnce();
		warn.mockRestore();
	});

	it("stays quiet for a nested mount that only looks like a repeat", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		resolveGalleryBases("/docs", "/docs-previews/");
		resolveGalleryBases("/docs", "/previews/docs/");
		resolveGalleryBases("", "/docs/loom-preview/");
		expect(warn).not.toHaveBeenCalled();
		warn.mockRestore();
	});
});

describe("loomDevRewrites", () => {
	it("maps the bare mount straight to the slashed upstream URL", () => {
		const [bare, catchAll] = loomDevRewrites(BASES, ORIGIN);
		expect(bare).toEqual({
			source: "/loom-preview",
			destination: `${ORIGIN}/loom-preview/`,
		});
		expect(catchAll).toEqual({
			source: "/loom-preview/:path*",
			destination: `${ORIGIN}/loom-preview/:path*`,
		});
	});

	it("declares mount-relative sources and public-base upstreams", () => {
		// Next prefixes its `basePath` onto every rewrite source itself, so the
		// sources must NOT name it (`/docs/docs/loom-preview` otherwise). It
		// leaves external destinations alone, and the gallery's own Vite instance
		// is mounted at the public base — hence the asymmetry.
		const [bare, catchAll] = loomDevRewrites(
			{ mountBase: BASE, publicBase: "/docs/loom-preview/" },
			ORIGIN,
		);
		expect(bare).toEqual({
			source: "/loom-preview",
			destination: `${ORIGIN}/docs/loom-preview/`,
		});
		expect(catchAll).toEqual({
			source: "/loom-preview/:path*",
			destination: `${ORIGIN}/docs/loom-preview/:path*`,
		});
	});
});

describe("loomStaticRewrites", () => {
	it("maps the bare mount onto the built index.html", () => {
		// Both sides are internal and mount-relative: Next prefixes its own
		// `basePath` onto each, so this same rule serves the gallery at
		// `/docs/loom-preview` without loom naming `/docs`.
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
		const rewrites = createLoomRewrites(undefined, BASES, {
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
		const rewrites = createLoomRewrites(undefined, BASES, {
			dev: true,
			ensureServer,
		});
		const result = await rewrites();
		expect(result.beforeFiles).toEqual(loomDevRewrites(BASES, ORIGIN));
		expect(result.afterFiles).toEqual([]);
	});

	it("keeps the user's rewrites when the gallery fails to boot", async () => {
		const error = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);
		const user = async (): Promise<NextRewritesResult> => [
			{ source: "/a", destination: "/b" },
		];
		const rewrites = createLoomRewrites(user, BASES, {
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
		const rewrites = createLoomRewrites(user, BASES, {
			dev: true,
			ensureServer: vi.fn().mockResolvedValue({ origin: ORIGIN }),
		});
		const result = await rewrites();
		expect(result.beforeFiles).toEqual([
			...loomDevRewrites(BASES, ORIGIN),
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

describe("resolveLoomNextOptions", () => {
	const project = mkdtempSync(join(tmpdir(), "loom-next-root-"));
	const docs = join(project, "docs");
	const target = "src/Scenes/Button.loom.tsx";
	mkdirSync(join(project, "src", "Scenes"), { recursive: true });
	mkdirSync(docs, { recursive: true });
	writeFileSync(
		join(project, ...target.split("/")),
		"export const preview = {};",
	);

	afterAll(() => rmSync(project, { recursive: true, force: true }));

	it("resolves root: '..' against the Next app directory and captures it", () => {
		const options = resolveLoomNextOptions({ root: ".." }, docs);
		expect(options.root).toBe(project);
		expect(isAbsolute(options.root)).toBe(true);

		const code = generateTargetsModule(options.root, [target]);
		expect(code).toContain(
			`${JSON.stringify(target)}: () => import(${JSON.stringify(
				toViteFsUrl(join(project, ...target.split("/"))),
			)})`,
		);
		expect(code).not.toContain("/@fsC:");
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
		process.env.LOOM_NEXT_GALLERY_BUILT = galleryBuildMarker(
			BASE,
			staticGalleryOutDir(BASE),
		);
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

/**
 * The Next `basePath` contract. The build marker doubles as the observation
 * point for the *effective build identity*: an empty root warns-and-skips
 * before Vite is ever loaded, but still records `publicBase|outDir` — exactly
 * the pair a real build would have used.
 */
describe("withLoomGallery with a Next basePath", () => {
	const empty = mkdtempSync(join(tmpdir(), "loom-next-basepath-"));
	afterAll(() => rmSync(empty, { recursive: true, force: true }));

	/** Run the build phase against a target-less root and return the marker. */
	async function markerFor<C extends object>(
		config: C | ((phase: string, context: unknown) => C | Promise<C>),
		base?: string,
	): Promise<string | undefined> {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		delete process.env.LOOM_NEXT_GALLERY_BUILT;
		try {
			await withLoomGallery(config, {
				root: empty,
				...(base === undefined ? {} : { base }),
			})(PHASE_PRODUCTION_BUILD, {});
			return process.env.LOOM_NEXT_GALLERY_BUILT;
		} finally {
			delete process.env.LOOM_NEXT_GALLERY_BUILT;
			warn.mockRestore();
		}
	}

	it("keeps an object config's basePath and the rest of it intact", async () => {
		const config = await withLoomGallery(
			{ basePath: "/rbxts-react-clean-ui", reactStrictMode: true },
			{ root: "." },
		)("phase-production-server", {});
		expect(config).toMatchObject({
			basePath: "/rbxts-react-clean-ui",
			reactStrictMode: true,
		});
		// The rewrite stays mount-relative — Next prefixes `/rbxts-react-clean-ui`
		// onto both sides itself.
		const rewrites = (
			config as unknown as { rewrites: () => Promise<NextRewritesResult> }
		).rewrites;
		expect(await rewrites()).toMatchObject({
			afterFiles: loomStaticRewrites(BASE),
		});
	});

	it("builds the gallery for basePath + mount, into public/<mount>", async () => {
		expect(await markerFor({ basePath: "/rbxts-react-clean-ui" })).toBe(
			galleryBuildMarker(
				"/rbxts-react-clean-ui/loom-preview/",
				join("public", "loom-preview"),
			),
		);
	});

	it("derives the public base from a function config's resolved result", async () => {
		const user = vi
			.fn()
			.mockResolvedValue({ basePath: "/rbxts-react-clean-ui" });
		expect(await markerFor(user)).toBe(
			galleryBuildMarker(
				"/rbxts-react-clean-ui/loom-preview/",
				join("public", "loom-preview"),
			),
		);
		expect(user).toHaveBeenCalledWith(PHASE_PRODUCTION_BUILD, {});
	});

	it("composes a custom loom base under the basePath", async () => {
		expect(await markerFor({ basePath: "/docs" }, "previews")).toBe(
			galleryBuildMarker("/docs/previews/", join("public", "previews")),
		);
	});

	it("changes nothing when the app has no basePath", async () => {
		expect(await markerFor({})).toBe(
			galleryBuildMarker(BASE, join("public", "loom-preview")),
		);
		expect(await markerFor({ basePath: "" })).toBe(
			galleryBuildMarker(BASE, join("public", "loom-preview")),
		);
	});

	it("does not let a bare-mount marker satisfy a based build", async () => {
		// A stale marker from a build without the basePath must not be mistaken
		// for this one: the emitted asset URLs would point at the wrong prefix.
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		const outDir = join("public", "loom-preview");
		process.env.LOOM_NEXT_GALLERY_BUILT = galleryBuildMarker(BASE, outDir);
		try {
			await withLoomGallery(
				{ basePath: "/rbxts-react-clean-ui" },
				{
					root: empty,
				},
			)(PHASE_PRODUCTION_BUILD, {});
			expect(process.env.LOOM_NEXT_GALLERY_BUILT?.split(",")).toEqual([
				galleryBuildMarker(BASE, outDir),
				galleryBuildMarker("/rbxts-react-clean-ui/loom-preview/", outDir),
			]);
			// …and the second worker process for that same build skips again.
			await withLoomGallery(
				{ basePath: "/rbxts-react-clean-ui" },
				{
					root: empty,
				},
			)(PHASE_PRODUCTION_BUILD, {});
			expect(process.env.LOOM_NEXT_GALLERY_BUILT?.split(",")).toHaveLength(2);
		} finally {
			delete process.env.LOOM_NEXT_GALLERY_BUILT;
			warn.mockRestore();
		}
	});

	it("matches the reported layout: docs/ app, root '..', export basePath", async () => {
		// rbxts-react-clean-ui/{docs/next.config.mjs, src/Scenes/Button.loom.tsx}
		const project = mkdtempSync(join(tmpdir(), "rbxts-react-clean-ui-"));
		const docs = join(project, "docs");
		mkdirSync(join(project, "src", "Scenes"), { recursive: true });
		mkdirSync(docs, { recursive: true });
		writeFileSync(
			join(project, "src", "Scenes", "Button.loom.tsx"),
			"export const preview = {};",
		);
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		try {
			// What `withLoomGallery(withMDX(config), { root: ".." })` resolves to
			// when `next.config.mjs` is evaluated with docs/ as the cwd.
			const resolved = resolveLoomNextOptions({ root: ".." }, docs);
			expect(resolved.root).toBe(project);
			expect(
				resolveGalleryBases("/rbxts-react-clean-ui", resolved.base),
			).toEqual({
				mountBase: "/loom-preview/",
				publicBase: "/rbxts-react-clean-ui/loom-preview/",
			});
			expect(staticGalleryOutDir("/loom-preview/")).toBe(
				join("public", "loom-preview"),
			);
			expect(warn).not.toHaveBeenCalled();
		} finally {
			warn.mockRestore();
			rmSync(project, { recursive: true, force: true });
		}
	});
});
