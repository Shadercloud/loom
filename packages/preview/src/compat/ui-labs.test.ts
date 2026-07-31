import { game } from "@loom-dev/runtime";
import { describe, expect, it } from "vitest";
import { UserInputService } from "../services.ts";
import { Environment } from "./ui-labs.ts";

describe("the UI Labs compatibility Environment", () => {
	it("models the non-story environment", () => {
		expect(Environment.IsStory()).toBe(false);
		expect(Environment.GetEnvGlobalInjection()).toBeUndefined();
		expect(Environment.GetJanitor()).toBeUndefined();
		// Story-only: the sandbox's own input signals don't exist here, which is
		// what makes `IsStory() ? InputListener : UserInputService` pick the
		// service.
		expect(Environment.InputListener).toBeUndefined();
		expect(Environment.EnvironmentUID).toBe("");
		expect(Environment.PreviewUID).toBe("");
	});

	it("reuses loom's UserInputService singleton rather than a copy", () => {
		expect(Environment.UserInput).toBe(UserInputService);
		expect(Environment.UserInput).toBe(game.GetService("UserInputService"));
	});

	it("exposes the input surface UI Labs consumers use", () => {
		const input = Environment.UserInput as unknown as Record<string, unknown>;
		for (const signal of ["InputBegan", "InputChanged", "InputEnded"]) {
			expect(input[signal]).toBeDefined();
			expect(
				(input[signal] as { Connect?: unknown } | undefined)?.Connect,
			).toBeTypeOf("function");
		}
		expect(input.GetMouseLocation).toBeDefined();
		expect(input.GetMouseLocation).toBeTypeOf("function");
	});

	it("keeps story lifecycle members as harmless no-ops", () => {
		// Cleanup code that calls these outside a story must not explode — but
		// nothing is emulated behind them.
		expect(() => Environment.Unmount()).not.toThrow();
		expect(() => Environment.Reload()).not.toThrow();
		expect(() => Environment.CreateSnapshot("shot")).not.toThrow();
		expect(() => Environment.SetStoryHolder(undefined)).not.toThrow();
		expect(Environment.Unmount()).toBeUndefined();
	});

	it("fabricates no plugin objects", () => {
		expect(Environment.PluginWidget).toBeUndefined();
		expect(Environment.Plugin).toBeUndefined();
	});

	it("emulates no story host API", () => {
		// Story creators, controls and snapshots need the real UI Labs plugin; an
		// import of one must stay a missing export, not a stub.
		const surface = Environment as unknown as Record<string, unknown>;
		for (const absent of [
			"CreateReactStory",
			"CreateVideStory",
			"CreateGenericStory",
			"Controls",
		]) {
			expect(surface[absent]).toBeUndefined();
		}
	});

	it("keeps `OriginalG` a single shared table", async () => {
		const again = await import("./ui-labs.ts");
		expect(again.Environment.OriginalG).toBe(Environment.OriginalG);
	});
});
