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
import { getService, type LoomInstance, type Vector2 } from "@loom-dev/runtime";

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

/**
 * Typed for the same reason as {@link LoomHttpService}: app code *calls* these,
 * and the index signature would hand it `unknown`. `GetTextSize` measures with
 * the renderer's own fonts, so what a component reserves matches what it paints.
 */
export interface LoomTextService extends LoomInstance {
	GetTextSize(
		text: string,
		fontSize: number,
		font?: unknown,
		frameSize?: Vector2,
	): Vector2;
	GetTextBoundsAsync(params: LoomInstance): Vector2;
}
export const TextService = getService("TextService") as LoomTextService;

/** `AddItem(instance, lifetime)` really does destroy it, on a real timer. */
export interface LoomDebris extends LoomInstance {
	AddItem(instance: LoomInstance, lifetime?: number): void;
}
export const Debris = getService("Debris") as LoomDebris;

/** `SetCore`/`GetCore` are no-ops: a preview has no core UI to toggle. */
export interface LoomStarterGui extends LoomInstance {
	SetCore(name: string, value: unknown): void;
	GetCore(name: string): unknown;
	SetCoreGuiEnabled(coreGuiType: unknown, enabled: boolean): void;
	GetCoreGuiEnabled(coreGuiType: unknown): boolean;
}
export const StarterGui = getService("StarterGui") as LoomStarterGui;

// Container-only services: no behavior to model, just a place instances live.
export const Lighting: LoomInstance = getService("Lighting");
export const ReplicatedFirst: LoomInstance = getService("ReplicatedFirst");
export const ReplicatedStorage: LoomInstance = getService("ReplicatedStorage");
export const ServerScriptService: LoomInstance = getService(
	"ServerScriptService",
);
export const ServerStorage: LoomInstance = getService("ServerStorage");
export const SoundService: LoomInstance = getService("SoundService");
export const StarterPack: LoomInstance = getService("StarterPack");
export const StarterPlayer: LoomInstance = getService("StarterPlayer");
export const Teams: LoomInstance = getService("Teams");
