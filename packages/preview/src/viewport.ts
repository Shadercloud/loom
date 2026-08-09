/**
 * Opt-in logical-viewport scaling for the preview stage.
 *
 * The preview lays a scene out against its mount: whatever `clientWidth` /
 * `clientHeight` the mount reports *is* the Roblox viewport (the react world
 * feeds it to the layout engine and mirrors it onto
 * `Workspace.CurrentCamera.ViewportSize`). That is the whole contract, and by
 * default nothing here touches it — a stage of any size lays the scene out
 * against its real pixels, which is what the engine does at that viewport.
 *
 * That default is not negotiable-by-heuristic, because the alternative is not a
 * smaller picture of the same layout — it is a *different* layout. Shrinking
 * the pixels instead of the viewport keeps the scene laid out at some other
 * width and paints it small: `TextWrapped` text keeps the line breaks it had at
 * the wide width instead of re-wrapping, a `UIListLayout` with `Wraps` keeps its
 * row count, `AutomaticSize` settles at the wide measurement, and a
 * `UISizeConstraint`, aspect ratio or scale-vs-offset mix re-proportions against
 * the wrong number. Everything then *looks* fine — just smaller — and is wrong
 * in exactly the places a narrow viewport is the thing you were checking. Loom
 * previews a Roblox UI; a narrow viewport has to reflow the way Roblox reflows.
 *
 * {@link scaleMountToViewport} still implements the zoom, because a page
 * embedding a preview at a fixed narrow width sometimes genuinely wants the
 * desktop composition rather than the reflow — a docs thumbnail of a wide
 * dashboard, say. It is reached only by asking for it with `?base=` (see
 * {@link resolveBaseWidth}), and then the mount keeps a logical width of that
 * base and is scaled down with a CSS transform to fit the real one. Everything
 * downstream is unchanged: the world reads the mount's (untransformed) layout
 * size, the browser maps touches through the transform for free, and the
 * renderer divides pointer coordinates by the same factor (it reads the mount's
 * own rendered-to-layout ratio), so hit testing lands where it looks like it
 * should.
 *
 * The height is *not* clamped to the base: it is the real height divided by the
 * scale, so a tall screen becomes a tall viewport rather than a letterboxed
 * 16:9 window. Scale-based (`UDim2` scale) layouts then still fill the screen.
 */

/**
 * The logical viewport width `?base=` falls back to when it is asked for
 * without a width it can read.
 *
 * A trade-off, not a constant with one right answer: the wider the base, the
 * more desktop layout survives intact and the smaller everything is drawn. 960
 * is the middle of it — wide enough that a two-column or fixed-panel layout
 * still has room, small enough that a phone renders the scene at ~40% rather
 * than the ~30% a 1280 base would give, where body text stops being readable.
 */
export const BASE_VIEWPORT_WIDTH = 960;

/**
 * The base width a preview mount should adapt to, from the page URL. `0` means
 * "never adapt" — {@link resolveViewport} is then the identity, and the scene
 * lays out against the real viewport at every width.
 *
 * - **Absent** — `0`. The scene reflows into whatever stage it is given, on
 *   every device, which is the only reading that matches the engine.
 * - **`?base=<px>`** sets the logical viewport, so a page embedding a preview
 *   at a fixed width can pick the one its scene was written for. A bare
 *   `?base`, or a width that can't be read, means {@link BASE_VIEWPORT_WIDTH} —
 *   the param was typed to ask for an adaptation, so it gets the default one
 *   rather than being ignored.
 * - **`?base=none`** (or `off`, or `0`) is the default spelled out, for a host
 *   page that templates the param and needs a value meaning "off".
 */
export function resolveBaseWidth(
	search: string,
	fallback: number = BASE_VIEWPORT_WIDTH,
): number {
	const params = new URLSearchParams(
		search.startsWith("?") ? search.slice(1) : search,
	);
	const raw = params.get("base")?.trim().toLowerCase();
	if (raw === undefined) return 0;
	if (raw === "none" || raw === "off") return 0;
	if (raw !== "") {
		const px = Number.parseFloat(raw);
		// A malformed `?base=` falls through to the default width rather than
		// silently ignoring a param that was written to turn the zoom on.
		if (Number.isFinite(px)) return Math.max(0, px);
	}
	return fallback;
}

/** {@link resolveBaseWidth} for the page this preview is running in. */
export function currentBaseWidth(): number {
	return resolveBaseWidth(location.search);
}

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
 * Wide enough (or not measured yet, or no base asked for) → the real size,
 * unscaled.
 */
export function resolveViewport(
	hostWidth: number,
	hostHeight: number,
	baseWidth = 0,
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
 * With the default `baseWidth` of `0` this is the identity and only the
 * disposer is real — the mount fills the host and the scene lays out against
 * the stage's own pixels.
 *
 * `mount` is expected to be an absolutely-positioned child filling `host`
 * (what `createRoot` builds). While scaling is active the fill is replaced by
 * an explicit logical size pinned to the host's top-left, since a transformed
 * `inset: 0` box would be laid out at the real size and only *painted* smaller.
 */
export function scaleMountToViewport(
	host: HTMLElement,
	mount: HTMLElement,
	baseWidth = 0,
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
	// Nothing to observe when no base width was asked for: `apply` is the
	// identity at every size, so the scene's own resize handling is the whole
	// story and this would only wake up to do nothing.
	if (!(baseWidth > 0)) return () => {};
	if (typeof ResizeObserver !== "function") return () => {};
	// Observing the host, never the mount: the mount is what this writes to, and
	// the host's size comes from the page (100dvh / an iframe), so there is no
	// feedback loop between the two.
	const observer = new ResizeObserver(apply);
	observer.observe(host);
	return () => observer.disconnect();
}
