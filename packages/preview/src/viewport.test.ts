/**
 * The logical-viewport scaling: off unless a page asks for it with `?base=`, so
 * a narrow stage lays the scene out against its real width (and reflows, the
 * way the engine does) rather than keeping a wide layout painted small.
 */
import { describe, expect, it } from "vitest";
import {
	BASE_VIEWPORT_WIDTH,
	resolveBaseWidth,
	resolveViewport,
	scaleMountToViewport,
} from "./viewport.ts";

/** A host whose measured size is fixed (happy-dom lays nothing out). */
function makeHost(width: number, height: number): HTMLElement {
	const host = document.createElement("div");
	Object.defineProperty(host, "clientWidth", { value: width });
	Object.defineProperty(host, "clientHeight", { value: height });
	return host;
}

describe("resolveViewport", () => {
	it("is the identity with no base width", () => {
		// The default everywhere: a phone-sized stage is a phone-sized viewport,
		// so the scene wraps and reflows into it instead of being zoomed out.
		expect(resolveViewport(390, 844)).toEqual({
			width: 390,
			height: 844,
			scale: 1,
		});
		expect(resolveViewport(1440, 900)).toEqual({
			width: 1440,
			height: 900,
			scale: 1,
		});
	});

	it("leaves a stage wider than the base alone", () => {
		expect(resolveViewport(1440, 900, BASE_VIEWPORT_WIDTH).scale).toBe(1);
		// Exactly the base width is already wide enough.
		expect(
			resolveViewport(BASE_VIEWPORT_WIDTH, 720, BASE_VIEWPORT_WIDTH).scale,
		).toBe(1);
	});

	it("keeps the base width and scales down under it", () => {
		const view = resolveViewport(390, 844, BASE_VIEWPORT_WIDTH);
		expect(view.width).toBe(BASE_VIEWPORT_WIDTH);
		expect(view.scale).toBeCloseTo(390 / BASE_VIEWPORT_WIDTH);
		// The scaled logical box covers the real one exactly — no letterboxing.
		expect(view.width * view.scale).toBeCloseTo(390);
		expect(view.height * view.scale).toBeCloseTo(844, 0);
	});

	it("grows the logical height rather than cropping a tall screen", () => {
		// A portrait screen becomes a portrait viewport, so scale-based layouts
		// still fill it instead of being letterboxed into 16:9.
		expect(
			resolveViewport(320, 800, BASE_VIEWPORT_WIDTH).height,
		).toBeGreaterThan(resolveViewport(320, 400, BASE_VIEWPORT_WIDTH).height);
	});

	it("stays neutral for an unmeasured stage", () => {
		expect(resolveViewport(0, 0, BASE_VIEWPORT_WIDTH).scale).toBe(1);
		expect(resolveViewport(390, 0, BASE_VIEWPORT_WIDTH).scale).toBe(1);
	});
});

describe("scaleMountToViewport", () => {
	it("leaves the mount alone by default, at any stage size", () => {
		// What every preview now gets: a narrow stage lays the scene out against
		// its real width, the way Studio does at that viewport.
		const host = makeHost(390, 844);
		const mount = document.createElement("div");
		mount.style.position = "absolute";
		mount.style.inset = "0";
		host.appendChild(mount);

		scaleMountToViewport(host, mount);

		expect(mount.style.transform).toBe("");
		expect(mount.style.width).toBe("");
		expect(mount.style.height).toBe("");
	});

	it("sizes the mount to the logical viewport when a base is asked for", () => {
		const host = makeHost(390, 844);
		const mount = document.createElement("div");
		mount.style.position = "absolute";
		mount.style.inset = "0";
		host.appendChild(mount);

		scaleMountToViewport(host, mount, BASE_VIEWPORT_WIDTH);

		const view = resolveViewport(390, 844, BASE_VIEWPORT_WIDTH);
		// The layout size the react world reads back off the mount.
		expect(mount.style.width).toBe(`${BASE_VIEWPORT_WIDTH}px`);
		expect(mount.style.height).toBe(`${view.height}px`);
		expect(mount.style.transform).toBe(`scale(${view.scale})`);
		expect(mount.style.transformOrigin).toBe("0 0");
	});

	it("leaves a stage wider than the base untouched", () => {
		const host = makeHost(1440, 900);
		const mount = document.createElement("div");
		mount.style.position = "absolute";
		mount.style.inset = "0";
		host.appendChild(mount);

		scaleMountToViewport(host, mount, BASE_VIEWPORT_WIDTH);

		expect(mount.style.transform).toBe("");
		expect(mount.style.width).toBe("");
		expect(mount.style.height).toBe("");
	});

	it("stops re-resolving once disposed", () => {
		const host = makeHost(390, 844);
		const mount = document.createElement("div");
		host.appendChild(mount);
		const stop = scaleMountToViewport(host, mount, BASE_VIEWPORT_WIDTH);
		expect(() => stop()).not.toThrow();
	});

	it("observes nothing when no base width is asked for", () => {
		const host = makeHost(390, 844);
		const mount = document.createElement("div");
		host.appendChild(mount);
		let observed = 0;
		const real = globalThis.ResizeObserver;
		class Counting {
			observe(): void {
				observed += 1;
			}
			unobserve(): void {}
			disconnect(): void {}
		}
		globalThis.ResizeObserver = Counting as unknown as typeof ResizeObserver;
		try {
			const stop = scaleMountToViewport(host, mount);
			expect(observed).toBe(0);
			stop();
			scaleMountToViewport(host, mount, BASE_VIEWPORT_WIDTH);
			expect(observed).toBe(1);
		} finally {
			globalThis.ResizeObserver = real;
		}
	});
});

describe("resolveBaseWidth", () => {
	it("is off unless the page asks for it", () => {
		// A narrow viewport is a narrow viewport: the scene reflows into it, and
		// Studio reflows there too, so loom must as well.
		expect(resolveBaseWidth("")).toBe(0);
		expect(resolveBaseWidth("?target=a&theme=light")).toBe(0);
	});

	it("reads the width off ?base=", () => {
		expect(resolveBaseWidth("?base=1280")).toBe(1280);
		expect(resolveBaseWidth("base=1280")).toBe(1280);
		// Alongside the rest of the URL contract, in any order.
		expect(resolveBaseWidth("?target=a&base=768&theme=light")).toBe(768);
	});

	it("spells the default out for a host page templating the param", () => {
		expect(resolveBaseWidth("?base=none")).toBe(0);
		expect(resolveBaseWidth("?base=off")).toBe(0);
		expect(resolveBaseWidth("?base=0")).toBe(0);
		expect(resolveBaseWidth("?base=-100")).toBe(0);
	});

	it("falls back to the default width for a value it can't read", () => {
		// The param was typed to turn the zoom *on*; a typo must not read as off,
		// which is what leaving it out already means.
		expect(resolveBaseWidth("?base")).toBe(BASE_VIEWPORT_WIDTH);
		expect(resolveBaseWidth("?base=")).toBe(BASE_VIEWPORT_WIDTH);
		expect(resolveBaseWidth("?base=wide")).toBe(BASE_VIEWPORT_WIDTH);
	});
});
