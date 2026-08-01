/**
 * Mobile viewport adaptation for the preview stage.
 *
 * The preview lays a scene out against its mount: whatever `clientWidth` /
 * `clientHeight` the mount reports *is* the Roblox viewport (the react world
 * feeds it to the layout engine and mirrors it onto
 * `Workspace.CurrentCamera.ViewportSize`). On a phone that viewport is ~390px
 * wide, so a UI written against a desktop-sized screen — offset sizes, fixed
 * panels, a sidebar — runs straight off the edge, and the page shows a slice of
 * a layout instead of the layout.
 *
 * So below {@link BASE_VIEWPORT_WIDTH} the stage stops shrinking the *scene* and
 * starts shrinking the *pixels*: the mount keeps a logical width of
 * `BASE_VIEWPORT_WIDTH` and is scaled down with a CSS transform to fit the real
 * one. Everything downstream is unchanged — the world still reads the mount's
 * (untransformed) layout size, so the scene lays out exactly as it does on a
 * desktop, and the browser maps touches through the transform for free. The
 * renderer divides pointer coordinates by the same factor (it reads the mount's
 * own rendered-to-layout ratio), so hit testing lands where it looks like it
 * should.
 *
 * The height is *not* clamped to a base: it is the real height divided by the
 * scale, so a tall phone screen becomes a tall viewport rather than a
 * letterboxed 16:9 window. Scale-based (`UDim2` scale) layouts then still fill
 * the screen, which is what they do on a real device.
 *
 * At or above the base width nothing is applied at all — a desktop preview is
 * pixel-for-pixel what it was before.
 */

/**
 * The logical viewport width a preview falls back to once the real one is
 * narrower. 1280 is loom's design reference: it is the default
 * `Workspace.CurrentCamera.ViewportSize` the runtime installs (1280x720), so a
 * scaled preview lays out against the same width an unmeasured one assumes.
 */
export const BASE_VIEWPORT_WIDTH = 1280;

export interface ResolvedViewport {
	/** Logical width the scene lays out against (CSS px, pre-transform). */
	width: number;
	/** Logical height the scene lays out against (CSS px, pre-transform). */
	height: number;
	/** Factor from logical px to on-screen px; 1 when no scaling is applied. */
	scale: number;
}

/**
 * The logical viewport for a stage of `hostWidth` x `hostHeight` real pixels.
 * Wide enough (or not measured yet) → the real size, unscaled.
 */
export function resolveViewport(
	hostWidth: number,
	hostHeight: number,
	baseWidth: number = BASE_VIEWPORT_WIDTH,
): ResolvedViewport {
	if (
		!(hostWidth > 0) ||
		!(hostHeight > 0) ||
		!(baseWidth > 0) ||
		hostWidth >= baseWidth
	) {
		return { width: hostWidth, height: hostHeight, scale: 1 };
	}
	const scale = hostWidth / baseWidth;
	return {
		width: baseWidth,
		// Round: a fractional layout height would make the world's viewport
		// jitter by a sub-pixel on every resize tick for no visible gain.
		height: Math.round(hostHeight / scale),
		scale,
	};
}

/** Whether `style` already carries exactly this resolved viewport. */
function isApplied(
	style: CSSStyleDeclaration,
	view: ResolvedViewport,
): boolean {
	if (view.scale === 1) return style.transform === "";
	return (
		style.width === `${view.width}px` &&
		style.height === `${view.height}px` &&
		style.transform === `scale(${view.scale})`
	);
}

/**
 * Keep `mount` sized and scaled to `host`'s viewport, re-resolving whenever the
 * host resizes. Returns a disposer.
 *
 * `mount` is expected to be an absolutely-positioned child filling `host`
 * (what `createRoot` builds). While scaling is active the fill is replaced by
 * an explicit logical size pinned to the host's top-left, since a transformed
 * `inset: 0` box would be laid out at the real size and only *painted* smaller.
 */
export function scaleMountToViewport(
	host: HTMLElement,
	mount: HTMLElement,
	baseWidth: number = BASE_VIEWPORT_WIDTH,
): () => void {
	const apply = (): void => {
		const view = resolveViewport(
			host.clientWidth,
			host.clientHeight,
			baseWidth,
		);
		// Writing identical styles would still invalidate layout on every resize
		// tick, and the world re-flushes off the mount's own ResizeObserver.
		if (isApplied(mount.style, view)) return;
		if (view.scale === 1) {
			mount.style.inset = "0";
			mount.style.width = "";
			mount.style.height = "";
			mount.style.transform = "";
			mount.style.transformOrigin = "";
			return;
		}
		mount.style.inset = "auto";
		mount.style.left = "0";
		mount.style.top = "0";
		mount.style.width = `${view.width}px`;
		mount.style.height = `${view.height}px`;
		mount.style.transformOrigin = "0 0";
		mount.style.transform = `scale(${view.scale})`;
	};

	apply();
	if (typeof ResizeObserver !== "function") return () => {};
	// Observing the host, never the mount: the mount is what this writes to, and
	// the host's size comes from the page (100dvh / an iframe), so there is no
	// feedback loop between the two.
	const observer = new ResizeObserver(apply);
	observer.observe(host);
	return () => observer.disconnect();
}
