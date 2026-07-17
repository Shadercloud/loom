/**
 * `@loom-dev/preview/client` — the browser stand-in for `@rbxts/react-roblox`.
 * The Vite plugin aliases `@rbxts/react-roblox` here so a roblox-ts app's
 * `createRoot(target).render(<App/>)` mounts into the preview DOM instead.
 */

import type { LoomRoot } from "@loom-dev/react";
import { render as loomRender } from "@loom-dev/react";
import type { ReactElement } from "react";

/**
 * Stand-in for `ReactRoblox.createPortal`. Renders children into a LoomInstance
 * container (typically `Players.LocalPlayer.PlayerGui`), matching the Roblox
 * signature component libraries call.
 */
export { createPortal } from "@loom-dev/react";

const HOST_ID = "loom-root";

/** The outer preview viewport (`#loom-root`), created if the host page lacks it. */
function resolveHost(): HTMLElement {
	const existing = document.getElementById(HOST_ID);
	if (existing) return existing;
	const el = document.createElement("div");
	el.id = HOST_ID;
	el.style.position = "relative";
	el.style.width = "100vw";
	el.style.height = "100vh";
	el.style.overflow = "hidden";
	document.body.appendChild(el);
	return el;
}

export interface LoomReactRoot {
	render(element: ReactElement): void;
	unmount(): void;
}

/**
 * Stand-in for `ReactRoblox.createRoot`. The Roblox target instance is ignored,
 * but each root gets its own container under `#loom-root`, so independent roots
 * (portals, multiple mounts) don't clobber each other — the renderer
 * `replaceChildren()`es its own mount on every commit.
 */
export function createRoot(_target?: unknown): LoomReactRoot {
	const mount = document.createElement("div");
	mount.style.position = "absolute";
	mount.style.inset = "0";
	resolveHost().appendChild(mount);

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
			mount.remove();
		},
	};
}
