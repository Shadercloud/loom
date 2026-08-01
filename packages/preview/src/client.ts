/**
 * `@loom-dev/preview/client` — the browser stand-in for `@rbxts/react-roblox`.
 * The Vite plugin aliases `@rbxts/react-roblox` here so a roblox-ts app's
 * `createRoot(target).render(<App/>)` mounts into the preview DOM instead.
 */

import type { LoomRoot } from "@loom-dev/react";
import { createPortal, render as loomRender } from "@loom-dev/react";
import { getService } from "@loom-dev/runtime";
import React, { type ReactElement } from "react";
import { scaleMountToViewport } from "./viewport.ts";

/**
 * Stand-in for `ReactRoblox.createPortal`. Renders children into a LoomInstance
 * container (typically `Players.LocalPlayer.PlayerGui`), matching the Roblox
 * signature component libraries call.
 */
export { createPortal };

/** The preview theme name mirrored onto `PlayerGui.LoomTheme`. */
export type PreviewTheme = "light" | "dark";

/**
 * Publish the host page's theme to the preview world: sets `LoomTheme` on
 * `Players.LocalPlayer.PlayerGui`, so scene shells can read it (and subscribe
 * via `GetPropertyChangedSignal("LoomTheme")`) with plain Roblox APIs — no
 * DOM access needed from roblox-ts code.
 */
export function setPreviewTheme(theme: PreviewTheme): void {
	const players = getService("Players") as unknown as {
		LocalPlayer?: { WaitForChild(name: string): Record<string, unknown> };
	};
	const playerGui = players.LocalPlayer?.WaitForChild("PlayerGui");
	if (playerGui) playerGui.LoomTheme = theme;
}

const HOST_ID = "loom-root";

/** The outer preview viewport (`#loom-root`), created if the host page lacks it. */
function resolveHost(): HTMLElement {
	const existing = document.getElementById(HOST_ID);
	if (existing) return existing;
	const el = document.createElement("div");
	el.id = HOST_ID;
	el.style.position = "relative";
	el.style.width = "100%";
	el.style.height = "100vh";
	// `100dvh` where supported: on mobile browsers `100vh` is the *largest*
	// viewport (toolbars retracted), so a `100vh` stage is taller than the
	// screen and the bottom of the scene sits under the URL bar. The assignment
	// is simply ignored by engines that don't know the unit, leaving `100vh`.
	el.style.height = "100dvh";
	el.style.overflow = "hidden";
	document.body.appendChild(el);
	return el;
}

export interface LoomReactRoot {
	render(element: ReactElement): void;
	unmount(): void;
}

/**
 * `ReactRoblox.RootOptions`. Every field is React-Lua hydration machinery,
 * which has no browser meaning under loom (there is no serialised Roblox tree
 * to hydrate), so the argument is accepted and ignored rather than rejected —
 * app code that passes one keeps compiling.
 */
export interface RootOptions {
	hydrate?: boolean;
	hydrationOptions?: Record<string, unknown>;
}

/**
 * Stand-in for `ReactRoblox.createRoot`. The Roblox target instance is ignored,
 * but each root gets its own container under `#loom-root`, so independent roots
 * (portals, multiple mounts) don't clobber each other — the renderer
 * `replaceChildren()`es its own mount on every commit.
 *
 * The container is also what carries the mobile viewport adaptation (see
 * `./viewport.ts`): on a screen narrower than the base width it keeps a
 * desktop-sized logical viewport and is scaled down to fit, so a scene written
 * for a desktop screen shrinks instead of overflowing.
 */
export function createRoot(
	_target?: unknown,
	_options?: RootOptions,
): LoomReactRoot {
	const mount = document.createElement("div");
	mount.style.position = "absolute";
	mount.style.inset = "0";
	const host = resolveHost();
	host.appendChild(mount);
	const stopScaling = scaleMountToViewport(host, mount);

	let root: Promise<LoomRoot> | undefined;
	const dispose = (): void => {
		const prev = root;
		root = undefined;
		void prev?.then((r) => {
			r.unmount();
		});
	};
	return {
		render(element: ReactElement): void {
			// Idempotent like ReactRoblox: tear down the previous tree (and its
			// ResizeObserver) before mounting again, so re-render doesn't leak.
			dispose();
			root = loomRender(element, mount);
		},
		unmount(): void {
			dispose();
			stopScaling();
			mount.remove();
		},
	};
}

/**
 * `ReactRoblox.createBlockingRoot` / `createLegacyRoot` — the React 17 root
 * flavours, both mapped onto {@link createRoot}.
 *
 * The three differ only in how React *schedules* work (legacy sync mode,
 * blocking mode, concurrent mode). Loom's world commits and flushes
 * synchronously either way — encode → layout → DOM patch runs inside
 * `resetAfterCommit` — so the distinction has nothing to express here, and the
 * tree that mounts is identical. Kept as separate exports because upstream
 * declares them and roblox-ts code written against React 17 calls them.
 */
export const createBlockingRoot = createRoot;
export const createLegacyRoot = createRoot;

/**
 * `ReactRoblox.act` — browser React's own, re-exported.
 *
 * Same purpose (flush effects and pending work before returning) and the same
 * implementation React's own test utilities use, so a roblox-ts test helper
 * that wraps updates in `act` behaves as written. React requires
 * `globalThis.IS_REACT_ACT_ENVIRONMENT = true` before it will run without
 * warning.
 */
export const act: typeof React.act = React.act;

/**
 * `ReactRoblox.version` — the React version loom actually renders with, not a
 * React-Lua version string. A preview reports what it is.
 */
export const version: string = React.version;

/**
 * `import ReactRoblox from "@rbxts/react-roblox"` — the namespace form, holding
 * the same values as the named exports.
 *
 * Upstream's typings are `export = ReactRoblox`, so under roblox-ts the default
 * import *is* the package, and `ReactRoblox.createRoot(...)` is how nearly all
 * roblox-ts code mounts. Without this the aliased module is named-exports-only
 * and the preview dies at load with "does not provide an export named
 * 'default'" — before any of it runs. `@rbxts/react` carries the same shape for
 * the same reason (see `./compat/react.ts`).
 */
export default {
	act,
	createBlockingRoot,
	createLegacyRoot,
	createPortal,
	createRoot,
	setPreviewTheme,
	version,
};
