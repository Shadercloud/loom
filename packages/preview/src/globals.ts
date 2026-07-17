/**
 * `@loom-dev/preview/globals` — installs the Roblox datatypes as globals the way
 * roblox-ts code expects (`UDim2.new` etc. without an import), and declares their
 * ambient types. The Vite plugin injects this before the app entry so a real
 * roblox-ts source tree runs unmodified.
 */
import type * as runtime from "@loom-dev/runtime";
import { installGlobals } from "@loom-dev/runtime";

installGlobals();

// Diagnostic: if nothing mounts into #loom-root shortly after load, the entry
// likely doesn't self-mount (e.g. it only exports a component). Warn rather than
// leaving a silently blank preview.
if (typeof document !== "undefined") {
	setTimeout(() => {
		const root = document.getElementById("loom-root");
		if (root && root.childElementCount === 0) {
			console.warn(
				"[loom] nothing mounted into #loom-root after 2s — does your entry " +
					"call createRoot().render(<App />) at the top level?",
			);
		}
	}, 2000);
}

declare global {
	const UDim: typeof runtime.UDim;
	const UDim2: typeof runtime.UDim2;
	const Vector2: typeof runtime.Vector2;
	const Vector3: typeof runtime.Vector3;
	const Color3: typeof runtime.Color3;
	const ColorSequence: typeof runtime.ColorSequence;
	const ColorSequenceKeypoint: typeof runtime.ColorSequenceKeypoint;
	const Rect: typeof runtime.Rect;
	const CFrame: typeof runtime.CFrame;
	const TweenInfo: typeof runtime.TweenInfo;
	const Enum: typeof runtime.Enum;
	const game: runtime.DataModel;
	const Instance: typeof runtime.Instance;
	const task: typeof runtime.task;
	const tick: typeof runtime.tick;
}
