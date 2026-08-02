import { game } from "@loom-dev/runtime";
import { describe, expect, it } from "vitest";
import * as services from "./services.ts";

/**
 * The alias module and the runtime's service registry can drift: a service can
 * be implemented in `@loom-dev/runtime` and forgotten here, and the miss only
 * surfaces in a consumer's browser as
 *
 *     The requested module "@rbxts/services" does not provide an export named
 *     "HttpService"
 *
 * — which is how loom's own `HttpService` gap was reported. This list is the
 * reviewed contract: the services loom means to expose to `@rbxts/services`.
 * Adding a browser-meaningful service to the runtime means adding it in both
 * places, and this test is what says so.
 *
 * Deliberately *not* every service `@rbxts/services` declares. Most Roblox
 * services have no browser implementation at all, and exporting hundreds of
 * silent stubs would trade a loud missing-export error for scenes that quietly
 * do nothing.
 */
const BROWSER_SUPPORTED_SERVICES = [
	"CollectionService",
	"ContextActionService",
	"Debris",
	"GuiService",
	"HttpService",
	"Lighting",
	"Players",
	"ReplicatedFirst",
	"ReplicatedStorage",
	"RunService",
	"ServerScriptService",
	"ServerStorage",
	"SoundService",
	"StarterGui",
	"StarterPack",
	"StarterPlayer",
	"Teams",
	"TextService",
	"TweenService",
	"UserInputService",
	"Workspace",
] as const;

describe("the @rbxts/services alias module", () => {
	it.each(
		BROWSER_SUPPORTED_SERVICES,
	)("exports %s as the very singleton game.GetService returns", (name) => {
		const exported = (services as unknown as Record<string, unknown>)[name];
		expect(exported).toBeDefined();
		expect(exported).toBe(game.GetService(name));
	});

	it("exports exactly the reviewed list — nothing more, nothing forgotten", () => {
		expect(Object.keys(services).sort()).toEqual([
			...BROWSER_SUPPORTED_SERVICES,
		]);
	});

	it("hands out real service instances, not plain objects", () => {
		for (const name of BROWSER_SUPPORTED_SERVICES) {
			const service = (services as unknown as Record<string, ServiceShape>)[
				name
			] as ServiceShape;
			expect(service.ClassName).toBe(name);
			expect(service.GetFullName()).toBe(name);
			expect(service.IsA("Instance")).toBe(true);
		}
	});
});

interface ServiceShape {
	readonly ClassName: string;
	GetFullName(): string;
	IsA(className: string): boolean;
}
