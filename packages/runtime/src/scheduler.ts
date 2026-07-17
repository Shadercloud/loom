/**
 * `scheduler.ts` — the single rAF frame loop behind the interactive runtime.
 *
 * One frame tick is the world heartbeat: `RenderStepped(dt)` (motion callbacks
 * write properties) → if anything is dirty, hand the snapshot to the registered
 * flusher (encode → layout → DOM patch) → `Heartbeat(dt)`. The loop only runs
 * while someone listens or work is pending, so an idle preview costs nothing.
 * `flushDirtyNow` exists for the react adapter's synchronous commit flush.
 */
import type { LoomInstance } from "./instance";
import { LoomSignal } from "./signal";

/** Receives the dirty-instance snapshot once per flush. */
export type Flusher = (dirty: LoomInstance[]) => void;

const dirty = new Set<LoomInstance>();
let flusher: Flusher | undefined;
let frameScheduled = false;
let lastFrameTime: number | undefined;

/** Register the world's flush callback (encode → layout → DOM patch). */
export function setFlusher(fn: Flusher | undefined): void {
	flusher = fn;
}

/** `RunService.RenderStepped` — fired at the top of every frame with `dt`. */
export const renderStepped = new LoomSignal<[number]>({
	onConnect: ensureFrame,
});

/** `RunService.Heartbeat` — fired after the flush every frame with `dt`. */
export const heartbeat = new LoomSignal<[number]>({ onConnect: ensureFrame });

/** Queue `inst` for the next flush and make sure a frame is coming. */
export function markDirty(inst: LoomInstance): void {
	dirty.add(inst);
	ensureFrame();
}

/** Number of instances awaiting a flush (test introspection). */
export function getDirtyCount(): number {
	return dirty.size;
}

/**
 * Flush the dirty set synchronously (react commit path — layout feedback must
 * land in the same commit, not a frame later). No-op when nothing is dirty.
 */
export function flushDirtyNow(): void {
	if (dirty.size === 0) return;
	const snapshot = [...dirty];
	dirty.clear();
	flusher?.(snapshot);
}

/** Schedule a frame tick if one isn't already pending. */
export function ensureFrame(): void {
	if (frameScheduled) return;
	frameScheduled = true;
	if (typeof requestAnimationFrame === "function") {
		requestAnimationFrame(frameTick);
	} else {
		// Non-browser environment (tests, SSR): approximate 60fps with a timer.
		setTimeout(() => frameTick(performance.now()), 16);
	}
}

/** Alias of {@link ensureFrame} (Roblox-side naming used by the world). */
export const requestFrame = ensureFrame;

function frameTick(now: number): void {
	frameScheduled = false;
	const dt =
		lastFrameTime === undefined
			? 1 / 60
			: Math.max(0, (now - lastFrameTime) / 1000);
	lastFrameTime = now;
	renderStepped.fire(dt);
	if (dirty.size > 0) {
		const snapshot = [...dirty];
		dirty.clear();
		flusher?.(snapshot);
	}
	heartbeat.fire(dt);
	if (
		renderStepped.hasConnections ||
		heartbeat.hasConnections ||
		dirty.size > 0
	) {
		ensureFrame();
	} else {
		lastFrameTime = undefined;
	}
}
