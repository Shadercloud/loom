/**
 * `@loom-dev/runtime` — the browser-side Roblox runtime.
 *
 * Everything preview app code touches at runtime lives here: the Roblox
 * datatypes (`datatypes.ts`) and `Enum` namespace (`enums.ts`), the Luau
 * global environment (`luau.ts`), Roblox-shaped signals (`signal.ts`), the
 * Proxy-based live instance tree (`instance.ts` + `registry.ts`), input
 * objects (`input.ts`), the frame scheduler (`scheduler.ts`), and the fake
 * `game` service tree (`game.ts` + `services.ts`). `installGlobals` wires the
 * lot onto `globalThis` the way roblox-ts output expects.
 */
export * from "./datatypes";
export * from "./enums";
export * from "./game";
export * from "./input";
export * from "./instance";
export * from "./luau";
export * from "./registry";
export * from "./scheduler";
export * from "./services";
export * from "./signal";
export * from "./tween";

import {
	CFrame,
	Color3,
	ColorSequence,
	ColorSequenceKeypoint,
	Font,
	Rect,
	TweenInfo,
	UDim,
	UDim2,
	Vector2,
	Vector3,
} from "./datatypes";
import { Enum } from "./enums";
import { game } from "./game";
import { createInstance, type LoomInstance } from "./instance";
import * as luau from "./luau";

/**
 * The roblox-ts `Instance` constructor: `new Instance("Frame", parent?)`
 * creates a live `LoomInstance` (and parents it when `parent` is given).
 */
export const Instance = function (
	this: unknown,
	className: string,
	parent?: LoomInstance,
): LoomInstance {
	const instance = createInstance(className);
	if (parent !== undefined) instance.Parent = parent;
	return instance;
} as unknown as new (
	className: string,
	parent?: LoomInstance,
) => LoomInstance;

/**
 * Install the runtime as globals, the way roblox-ts code expects (`UDim2.new`,
 * `game.GetService`, `pcall`, … without an import). The loom Vite plugin
 * invokes this before the app entry; typed preview code can also import the
 * exports directly. Also applies the roblox-ts prototype patches
 * (`Array.prototype.size()` etc. — guarded, so browser built-ins like `Math`
 * and `String` are never clobbered).
 */
export function installGlobals(
	target: Record<string, unknown> = globalThis as unknown as Record<
		string,
		unknown
	>,
): void {
	luau.applyPrototypePatches();
	// Datatypes.
	target.UDim = UDim;
	target.UDim2 = UDim2;
	target.Vector2 = Vector2;
	target.Vector3 = Vector3;
	target.Color3 = Color3;
	target.ColorSequence = ColorSequence;
	target.ColorSequenceKeypoint = ColorSequenceKeypoint;
	target.Rect = Rect;
	target.CFrame = CFrame;
	target.TweenInfo = TweenInfo;
	target.Font = Font;
	target.Enum = Enum;
	// The live tree.
	target.game = game;
	target.Instance = Instance;
	// Luau environment.
	target.task = luau.task;
	target.tick = luau.tick;
	target.math = luau.math;
	target.string = luau.string;
	target.os = luau.os;
	target.coroutine = luau.coroutine;
	target.typeIs = luau.typeIs;
	target.typeOf = luau.typeOf;
	target.pcall = luau.pcall;
	target.xpcall = luau.xpcall;
	target.pairs = luau.pairs;
	target.ipairs = luau.ipairs;
	target.next = luau.next;
	target.tostring = luau.tostring;
	target.tonumber = luau.tonumber;
	target.error = luau.error;
	target.warn = luau.warn;
	target.print = luau.print;
}
