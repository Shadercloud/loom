/**
 * `compat/ui-labs.ts` — loom's browser stand-in for the root `@rbxts/ui-labs`
 * import.
 *
 * UI Labs ships a Luau runtime plus `.d.ts` declarations and no TypeScript
 * implementation, so nothing in it can run in the browser and the `.luau`-main
 * fallback has nothing to redirect to (see `../resolver.ts`). What loom *can*
 * answer for is the one part of the package that has a well-defined meaning
 * outside the Studio plugin: `Environment`.
 *
 * A loom preview is not a UI Labs story — there is no plugin, no story host, no
 * environment global injection. UI Labs itself defines that case: every
 * `Environment` member is read out of an injected env table with a fallback,
 * and with no injection each one collapses to its fallback. This module is
 * exactly that collapsed state, member for member (`Environment.luau`, 2.4.2):
 *
 * | member                  | non-story value                          |
 * | ----------------------- | ---------------------------------------- |
 * | `GetEnvGlobalInjection` | `undefined` — nothing was injected       |
 * | `IsStory`               | `false` — that *is* the injection test   |
 * | `Unmount` / `Reload`    | no-op                                    |
 * | `CreateSnapshot`        | no-op                                    |
 * | `SetStoryHolder`        | no-op                                    |
 * | `GetJanitor`            | `undefined` — the janitor is story-owned |
 * | `InputListener`         | `undefined` — story-only                 |
 * | `UserInput`             | `game.GetService("UserInputService")`    |
 * | `EnvironmentUID`        | `""`                                     |
 * | `PreviewUID`            | `""`                                     |
 * | `PluginWidget`          | `undefined` — no plugin                  |
 * | `Plugin`                | `undefined` — no plugin                  |
 *
 * Nothing else from the package is provided. Story creators, controls,
 * snapshots and the plugin APIs need the real host; importing one still fails
 * with a plain missing-export error, which is the honest answer — a stub that
 * silently behaves differently than Studio would be worse.
 *
 * `../services.ts` (not `@rbxts/services`) is imported deliberately: this module
 * is the *target* of an alias entry, and reaching the singleton through another
 * aliased specifier would make the shim depend on loom's alias table being
 * re-applied to its own output. The relative path is the same file the
 * `@rbxts/services` alias points at, so app code and this module share one
 * instance either way.
 */
import { UserInputService } from "../services.ts";

const noop = (): void => {};

/**
 * Stand-in for Roblox's `_G`. UI Labs hands back the *original* `_G` so story
 * code can reach the shared table past its sandbox; loom has no sandbox and no
 * `_G`, so this is one plain shared table for the whole preview — mutable and
 * shared, like `_G`, and empty because nothing else writes to it.
 */
const sharedG: Record<string, unknown> = {};

/**
 * UI Labs' `Environment`, as it behaves when the importing code is *not*
 * running inside a story. See the module doc for the member-by-member mapping.
 */
export const Environment = {
	/** The env-table key UI Labs injects under; kept so a consumer can read it. */
	EnvGlobalInjectionKey: "__hotreload_env_global_injection__",
	/** Nothing is injected outside a story. */
	GetEnvGlobalInjection: (): undefined => undefined,
	/** Loom is not a story host — and this is the guard app code branches on. */
	IsStory: (): false => false,
	/** Story lifecycle: harmless no-ops so ordinary cleanup code still runs. */
	Unmount: noop,
	Reload: noop,
	CreateSnapshot: (_name?: string): void => {},
	SetStoryHolder: (_holder?: unknown): void => {},
	/** The janitor belongs to a story; there is none here. */
	GetJanitor: (): undefined => undefined,
	/** The story sandbox's input signals — absent outside a story. */
	InputListener: undefined,
	/** UI Labs' own non-story fallback: the real `UserInputService` singleton. */
	UserInput: UserInputService,
	EnvironmentUID: "",
	PreviewUID: "",
	OriginalG: sharedG,
	/** Studio plugin objects. Loom has no plugin; it will not fake one. */
	PluginWidget: undefined,
	Plugin: undefined,
};
