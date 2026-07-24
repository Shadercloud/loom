// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
	DEFAULT_GALLERY_BASE,
	findGalleryTargets,
	isGalleryRequest,
	normalizeGalleryBase,
} from "./embed.ts";

describe("normalizeGalleryBase", () => {
	it("defaults to /loom-preview/", () => {
		expect(normalizeGalleryBase()).toBe(DEFAULT_GALLERY_BASE);
		// A bare "/" is the host's own root — never a mount point.
		expect(normalizeGalleryBase("/")).toBe(DEFAULT_GALLERY_BASE);
	});

	it("forces the leading and trailing slash Vite's base expects", () => {
		expect(normalizeGalleryBase("preview")).toBe("/preview/");
		expect(normalizeGalleryBase("/preview")).toBe("/preview/");
		expect(normalizeGalleryBase("/preview/")).toBe("/preview/");
		expect(normalizeGalleryBase("docs/embed")).toBe("/docs/embed/");
	});
});

describe("isGalleryRequest", () => {
	const base = "/loom-preview/";

	it("claims the mount, its bare form, and everything under it", () => {
		expect(isGalleryRequest("/loom-preview/", base)).toBe(true);
		expect(isGalleryRequest("/loom-preview", base)).toBe(true);
		expect(isGalleryRequest("/loom-preview/index.html?target=a", base)).toBe(
			true,
		);
		expect(isGalleryRequest("/loom-preview/@vite/client", base)).toBe(true);
	});

	it("leaves the host's own routes alone", () => {
		expect(isGalleryRequest("/", base)).toBe(false);
		expect(isGalleryRequest("/docs/loom/", base)).toBe(false);
		// Shares the prefix but is a different route.
		expect(isGalleryRequest("/loom-previews/x", base)).toBe(false);
	});
});

describe("findGalleryTargets", () => {
	const root = mkdtempSync(join(tmpdir(), "loom-embed-"));
	afterAll(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it("discovers targets under the default glob, and none when empty", () => {
		expect(findGalleryTargets(root)).toEqual([]);

		mkdirSync(join(root, "src", "preview-targets"), { recursive: true });
		writeFileSync(join(root, "src", "preview-targets", "A.loom.tsx"), "");
		writeFileSync(join(root, "src", "preview-targets", "notes.tsx"), "");

		expect(findGalleryTargets(root)).toEqual([
			"src/preview-targets/A.loom.tsx",
		]);
		// A bare directory narrows discovery to that subtree.
		expect(findGalleryTargets(root, "src/preview-targets")).toEqual([
			"src/preview-targets/A.loom.tsx",
		]);
		expect(findGalleryTargets(root, "src/other")).toEqual([]);
	});
});
