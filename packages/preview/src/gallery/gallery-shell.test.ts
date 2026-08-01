import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const client = vi.hoisted(() => ({
	render: vi.fn(),
	unmount: vi.fn(),
	setPreviewTheme: vi.fn(),
}));

vi.mock("../client.ts", () => ({
	createRoot: () => ({
		render: client.render,
		unmount: client.unmount,
	}),
	setPreviewTheme: client.setPreviewTheme,
}));

import { startGallery } from "./gallery-shell.ts";

const TARGET = "src/Scenes/Button.loom.tsx";

describe("gallery target diagnostics", () => {
	beforeEach(() => {
		client.render.mockClear();
		client.unmount.mockClear();
		client.setPreviewTheme.mockClear();
		document.body.innerHTML = `
			<aside id="loom-gallery-sidebar"></aside>
			<main id="loom-gallery-stage"><div id="loom-root"></div></main>
		`;
		window.history.replaceState(
			{},
			"",
			`/loom-preview/?chrome=none&target=${encodeURIComponent(TARGET)}`,
		);
	});

	it("shows the target path and preview contract for a default-only module", async () => {
		startGallery({
			[TARGET]: async () => ({ default: () => React.createElement("frame") }),
		});

		const panel = document.querySelector(".loom-gallery-error");
		await vi.waitFor(() => {
			expect(panel?.textContent).toContain(
				`invalid preview export in ${TARGET}`,
			);
		});
		expect(panel?.textContent).toContain(
			'target must export `const preview = { render: () => <.../>, title: "..." } as const`',
		);
		expect(client.render).not.toHaveBeenCalled();
	});

	it("keeps the sidebar out of chromeless mode entirely", () => {
		startGallery({
			[TARGET]: async () => ({
				preview: { render: () => React.createElement("frame") } as const,
			}),
		});
		expect(document.getElementById("loom-gallery-sidebar")?.hidden).toBe(true);
		expect(document.querySelector(".loom-gallery-toggle")).toBeNull();
	});

	it("mounts a valid preview export without showing an error", async () => {
		const render = () => React.createElement("frame");
		startGallery({
			[TARGET]: async () => ({
				preview: { render, title: "Button" } as const,
			}),
		});

		await vi.waitFor(() => expect(client.render).toHaveBeenCalledOnce());
		const boundary = client.render.mock.calls[0]?.[0] as React.ReactElement<{
			children: React.ReactElement;
		}>;
		expect(boundary.props.children.type).toBe(render);
		expect(
			document.querySelector(".loom-gallery-error")?.hasAttribute("hidden"),
		).toBe(true);
	});
});

/**
 * The narrow-screen chrome: the CSS media query stacks the sidebar over the
 * stage and hides the list unless `body.loom-gallery-open` is set — this is the
 * state side of that contract.
 */
describe("gallery chrome on a narrow screen", () => {
	beforeEach(() => {
		client.render.mockClear();
		document.body.className = "";
		document.body.innerHTML = `
			<aside id="loom-gallery-sidebar"></aside>
			<main id="loom-gallery-stage"><div id="loom-root"></div></main>
		`;
		window.history.replaceState({}, "", "/loom-preview/");
	});

	it("opens the target list from the toggle and closes it on selection", () => {
		startGallery({
			[TARGET]: async () => ({
				preview: { render: () => React.createElement("frame") } as const,
			}),
		});

		const toggle = document.querySelector(
			".loom-gallery-toggle",
		) as HTMLButtonElement;
		expect(toggle.getAttribute("aria-expanded")).toBe("false");

		toggle.click();
		expect(document.body.classList.contains("loom-gallery-open")).toBe(true);
		expect(toggle.getAttribute("aria-expanded")).toBe("true");

		// Picking a target hands the screen back to the stage.
		(document.querySelector(".loom-gallery-item") as HTMLElement).click();
		expect(document.body.classList.contains("loom-gallery-open")).toBe(false);
		expect(toggle.getAttribute("aria-expanded")).toBe("false");
		expect(location.hash).toBe(`#/${TARGET}`);
	});
});
