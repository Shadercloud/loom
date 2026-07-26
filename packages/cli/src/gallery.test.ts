// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	DEFAULT_PORT,
	DEFAULT_TARGETS_GLOB,
	resolveGalleryOptions,
} from "./gallery.ts";

describe("resolveGalleryOptions", () => {
	it("stays out of gallery mode with no flag and no config", () => {
		const decision = resolveGalleryOptions({});
		expect(decision.patterns).toBeUndefined();
		expect(decision.port).toBe(DEFAULT_PORT);
		expect(decision.hint).toBeUndefined();
	});

	it("enables gallery mode from the bare CLI flag", () => {
		const decision = resolveGalleryOptions({ cliTargets: true });
		expect(decision.patterns).toEqual([DEFAULT_TARGETS_GLOB]);
	});

	it("uses config targets/port when CLI flags are absent", () => {
		const decision = resolveGalleryOptions({
			configPresent: true,
			config: { targets: "src/preview-targets", port: 4175 },
		});
		expect(decision.patterns).toEqual([
			`src/preview-targets/${DEFAULT_TARGETS_GLOB}`,
		]);
		expect(decision.port).toBe(4175);
		expect(decision.hint).toBeUndefined();
	});

	it("accepts string[] config targets", () => {
		const decision = resolveGalleryOptions({
			configPresent: true,
			config: { targets: ["a", "b"] },
		});
		expect(decision.patterns).toEqual([
			`a/${DEFAULT_TARGETS_GLOB}`,
			`b/${DEFAULT_TARGETS_GLOB}`,
		]);
	});

	it("prefers CLI flags over config values", () => {
		const decision = resolveGalleryOptions({
			cliTargets: "elsewhere",
			cliPort: 5401,
			configPresent: true,
			config: { targets: "src/preview-targets", port: 4175 },
		});
		expect(decision.patterns).toEqual([`elsewhere/${DEFAULT_TARGETS_GLOB}`]);
		expect(decision.port).toBe(5401);
	});

	it("skips a config without a targets field, with a hint", () => {
		const decision = resolveGalleryOptions({
			configPresent: true,
			config: { projectName: "legacy", server: { port: 4175 } },
		});
		expect(decision.patterns).toBeUndefined();
		expect(decision.hint).toContain("no `targets` field");
		// The skipped config is skipped whole — even a top-level port.
		const withPort = resolveGalleryOptions({
			configPresent: true,
			config: { port: 4175 },
		});
		expect(withPort.port).toBe(DEFAULT_PORT);
		expect(withPort.hint).toContain("no `targets` field");
	});

	it("still honors the CLI flag when the config is legacy", () => {
		const decision = resolveGalleryOptions({
			cliTargets: true,
			configPresent: true,
			config: { projectName: "legacy" },
		});
		expect(decision.patterns).toEqual([DEFAULT_TARGETS_GLOB]);
		expect(decision.hint).toBeUndefined();
	});
});
