// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	packageRootOf,
	SUPPORTED_ENTRYPOINTS,
	unsupportedEntrypoint,
	unsupportedEntrypointError,
} from "./entrypoints.ts";

describe("packageRootOf", () => {
	it("keeps both segments of a scoped name", () => {
		expect(packageRootOf("@rbxts/react")).toBe("@rbxts/react");
		expect(packageRootOf("@rbxts/react/jsx-runtime")).toBe("@rbxts/react");
	});

	it("takes the first segment of an unscoped name", () => {
		expect(packageRootOf("react")).toBe("react");
		expect(packageRootOf("react/jsx-runtime")).toBe("react");
	});
});

describe("unsupportedEntrypoint", () => {
	it("passes the adapted entrypoints through", () => {
		for (const entries of Object.values(SUPPORTED_ENTRYPOINTS)) {
			for (const entry of entries) {
				expect(unsupportedEntrypoint(entry), entry).toBeUndefined();
			}
		}
	});

	it("names an unadapted subpath of an adapted package", () => {
		expect(unsupportedEntrypoint("@rbxts/react/internal")).toEqual({
			pkg: "@rbxts/react",
			supported: SUPPORTED_ENTRYPOINTS["@rbxts/react"],
		});
		// The catch-all react-roblox alias used to swallow this and resolve it to
		// `createRoot`, which is worse than failing.
		expect(unsupportedEntrypoint("@rbxts/react-roblox/client")?.pkg).toBe(
			"@rbxts/react-roblox",
		);
	});

	it("has no opinion about packages loom does not adapt", () => {
		expect(unsupportedEntrypoint("@rbxts/services")).toBeUndefined();
		expect(unsupportedEntrypoint("@rbxts/react-ripple")).toBeUndefined();
		// A different package that merely starts the same way.
		expect(unsupportedEntrypoint("@rbxts/react-extra")).toBeUndefined();
		expect(unsupportedEntrypoint("react/jsx-runtime")).toBeUndefined();
	});
});

describe("unsupportedEntrypointError", () => {
	const message = unsupportedEntrypointError(
		"@rbxts/react/internal",
		"/proj/src/app.tsx",
	).message;

	it("names loom, the specifier, and every supported entrypoint", () => {
		expect(message).toContain("[loom]");
		expect(message).toContain('"@rbxts/react/internal"');
		expect(message).toContain("- @rbxts/react\n");
		expect(message).toContain("- @rbxts/react/jsx-runtime");
		expect(message).toContain("- @rbxts/react/jsx-dev-runtime");
		expect(message).toContain("Imported by /proj/src/app.tsx");
	});

	it("omits the importer when there isn't one", () => {
		expect(unsupportedEntrypointError("@rbxts/react/x").message).not.toContain(
			"Imported by",
		);
	});
});
