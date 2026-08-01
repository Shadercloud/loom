/**
 * The mobile viewport adaptation: a stage narrower than the base width keeps a
 * desktop-sized logical viewport and is scaled down to fit, instead of laying
 * the scene out against a phone-sized viewport (where it overflows).
 */
import { describe, expect, it } from "vitest";
import {
	BASE_VIEWPORT_WIDTH,
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
	it("leaves a desktop-sized stage alone", () => {
		expect(resolveViewport(1440, 900)).toEqual({
			width: 1440,
			height: 900,
			scale: 1,
		});
		// Exactly the base width is already wide enough.
		expect(resolveViewport(BASE_VIEWPORT_WIDTH, 720).scale).toBe(1);
	});

	it("keeps the base width and scales down on a phone-sized stage", () => {
		const view = resolveViewport(390, 844);
		expect(view.width).toBe(BASE_VIEWPORT_WIDTH);
		expect(view.scale).toBeCloseTo(390 / BASE_VIEWPORT_WIDTH);
		// The scaled logical box covers the real one exactly — no letterboxing.
		expect(view.width * view.scale).toBeCloseTo(390);
		expect(view.height * view.scale).toBeCloseTo(844, 0);
	});

	it("grows the logical height rather than cropping a tall screen", () => {
		// A portrait phone becomes a portrait viewport, so scale-based layouts
		// still fill the screen instead of being letterboxed into 16:9.
		expect(resolveViewport(320, 800).height).toBeGreaterThan(
			resolveViewport(320, 400).height,
		);
	});

	it("stays neutral for an unmeasured stage", () => {
		expect(resolveViewport(0, 0).scale).toBe(1);
		expect(resolveViewport(390, 0).scale).toBe(1);
	});
});

describe("scaleMountToViewport", () => {
	it("sizes the mount to the logical viewport and scales it to fit", () => {
		const host = makeHost(390, 844);
		const mount = document.createElement("div");
		mount.style.position = "absolute";
		mount.style.inset = "0";
		host.appendChild(mount);

		scaleMountToViewport(host, mount);

		const view = resolveViewport(390, 844);
		// The layout size the react world reads back off the mount.
		expect(mount.style.width).toBe(`${BASE_VIEWPORT_WIDTH}px`);
		expect(mount.style.height).toBe(`${view.height}px`);
		expect(mount.style.transform).toBe(`scale(${view.scale})`);
		expect(mount.style.transformOrigin).toBe("0 0");
	});

	it("leaves a wide stage completely untouched", () => {
		const host = makeHost(1440, 900);
		const mount = document.createElement("div");
		mount.style.position = "absolute";
		mount.style.inset = "0";
		host.appendChild(mount);

		scaleMountToViewport(host, mount);

		expect(mount.style.transform).toBe("");
		expect(mount.style.width).toBe("");
		expect(mount.style.height).toBe("");
	});

	it("stops re-resolving once disposed", () => {
		const host = makeHost(390, 844);
		const mount = document.createElement("div");
		host.appendChild(mount);
		const stop = scaleMountToViewport(host, mount);
		expect(() => stop()).not.toThrow();
	});
});
