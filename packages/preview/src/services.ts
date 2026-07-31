/**
 * `@loom-dev/preview/services` — the browser stand-in for `@rbxts/services`.
 *
 * roblox-ts code imports service singletons as named exports
 * (`import { RunService } from "@rbxts/services"`); the Vite plugin aliases
 * that specifier here. Each export is the same singleton `game.GetService`
 * returns, so preview code and app code always see one instance. Only the
 * services the runtime actually implements are exported — an unknown service
 * would be a warned stub anyway, so a missing name here surfaces as a build
 * error instead of a silent stub.
 */
import { getService, type LoomInstance } from "@loom-dev/runtime";

export const CollectionService: LoomInstance = getService("CollectionService");
export const ContextActionService: LoomInstance = getService(
	"ContextActionService",
);
export const GuiService: LoomInstance = getService("GuiService");
/**
 * Typed beyond `LoomInstance` because the index signature that carries arbitrary
 * Roblox properties types every method as `unknown`, and app code calls this one
 * directly (`HttpService.GenerateGUID(false)`) rather than reading a property.
 * The declared surface is exactly what the runtime implements — the network
 * methods are absent here on purpose, and throw if reached anyway.
 */
export interface LoomHttpService extends LoomInstance {
	GenerateGUID(wrapInCurlyBraces?: boolean): string;
	JSONEncode(value: unknown): string;
	JSONDecode(value: string): unknown;
}
export const HttpService = getService("HttpService") as LoomHttpService;
export const Players: LoomInstance = getService("Players");
export const RunService: LoomInstance = getService("RunService");
export const TweenService: LoomInstance = getService("TweenService");
export const UserInputService: LoomInstance = getService("UserInputService");
export const Workspace: LoomInstance = getService("Workspace");
