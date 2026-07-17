/**
 * The loom gallery shell — the browser chrome around preview targets.
 *
 * Deliberately plain DOM (no React for the chrome itself), so a broken target
 * or a broken loom runtime can never white-screen the gallery: the sidebar and
 * error panel stay alive no matter what a target does.
 *
 * - Sidebar lists every discovered `*.loom.tsx` (label = relative path until
 *   the module's `preview.title` is known; titles are lazy-loaded on idle).
 * - Hash routing: `#/<relPath>` selects a target and survives full reloads.
 * - Each target renders through `createRoot()` from @loom-dev/preview, inside
 *   a React error boundary; import failures, bad `preview` exports, and render
 *   throws all land in the inline red error panel instead of taking the page.
 *
 * This module is loom-owned browser code served via /@fs/, so it may import
 * plain `react` directly (the preview plugin dedupes it with the adapter's).
 */

import { targets } from "virtual:loom-targets";
import { createRoot, type LoomReactRoot } from "@loom-dev/preview/client";
import * as React from "react";
import "./shell.css";

type TargetModule = Record<string, unknown>;

interface PreviewExport {
	render: () => React.ReactElement;
	title?: unknown;
}

// ---------------------------------------------------------------------------
// Error boundary (the only React used by the chrome). Renders null on failure
// and reports through a callback so the plain-DOM panel can paint the stack.
// ---------------------------------------------------------------------------

interface BoundaryProps {
	onError: (error: unknown) => void;
	children?: React.ReactNode;
}

class ErrorBoundary extends React.Component<
	BoundaryProps,
	{ failed: boolean }
> {
	override state = { failed: false };

	static getDerivedStateFromError(): { failed: boolean } {
		return { failed: true };
	}

	override componentDidCatch(error: Error): void {
		this.props.onError(error);
	}

	override render(): React.ReactNode {
		return this.state.failed ? null : (this.props.children ?? null);
	}
}

// ---------------------------------------------------------------------------
// Chrome DOM
// ---------------------------------------------------------------------------

function byId(id: string): HTMLElement {
	const el = document.getElementById(id);
	if (el) return el;
	const created = document.createElement("div");
	created.id = id;
	document.body.appendChild(created);
	return created;
}

const sidebar = byId("loom-gallery-sidebar");
const stage = byId("loom-gallery-stage");

const keys = Object.keys(targets).sort();
const items = new Map<string, HTMLLIElement>();
const moduleCache = new Map<string, Promise<TargetModule>>();

const header = document.createElement("div");
header.className = "loom-gallery-header";
const headerName = document.createElement("span");
headerName.textContent = "loom gallery";
const headerCount = document.createElement("span");
headerCount.className = "loom-gallery-count";
headerCount.textContent = String(keys.length);
header.append(headerName, headerCount);

const list = document.createElement("ul");
list.className = "loom-gallery-list";
for (const key of keys) {
	const item = document.createElement("li");
	item.className = "loom-gallery-item";
	item.textContent = key;
	item.title = key;
	item.addEventListener("click", () => {
		location.hash = `#/${key}`;
	});
	items.set(key, item);
	list.appendChild(item);
}
if (keys.length === 0) {
	const empty = document.createElement("li");
	empty.className = "loom-gallery-empty";
	empty.textContent = "no *.loom.tsx targets found";
	list.appendChild(empty);
}
sidebar.append(header, list);

const placeholder = document.createElement("div");
placeholder.className = "loom-gallery-placeholder";
placeholder.textContent = keys.length > 0 ? "select a target" : "no targets";
stage.appendChild(placeholder);

const errorPanel = document.createElement("div");
errorPanel.className = "loom-gallery-error";
errorPanel.hidden = true;
stage.appendChild(errorPanel);

function showError(title: string, error: unknown): void {
	const detail =
		error instanceof Error ? (error.stack ?? error.message) : String(error);
	errorPanel.replaceChildren();
	const heading = document.createElement("div");
	heading.className = "loom-gallery-error-title";
	heading.textContent = title;
	const stack = document.createElement("pre");
	stack.textContent = detail;
	errorPanel.append(heading, stack);
	errorPanel.hidden = false;
}

function clearError(): void {
	errorPanel.hidden = true;
	errorPanel.replaceChildren();
}

// ---------------------------------------------------------------------------
// Target loading + mounting
// ---------------------------------------------------------------------------

function loadTarget(key: string): Promise<TargetModule> {
	let promise = moduleCache.get(key);
	if (!promise) {
		const loader = targets[key];
		promise = loader
			? loader()
			: Promise.reject(new Error(`unknown target: ${key}`));
		promise.catch(() => moduleCache.delete(key)); // keep failures retryable
		moduleCache.set(key, promise);
	}
	return promise;
}

function getPreview(mod: TargetModule): PreviewExport {
	const preview = mod.preview;
	if (
		typeof preview !== "object" ||
		preview === null ||
		typeof (preview as { render?: unknown }).render !== "function"
	) {
		throw new Error(
			'target must export `const preview = { render: () => <.../>, title: "..." } as const`',
		);
	}
	return preview as unknown as PreviewExport;
}

/** Upgrade a sidebar label from its relPath to the target's `preview.title`. */
function applyTitle(key: string, preview: PreviewExport): void {
	const item = items.get(key);
	if (!item) return;
	if (typeof preview.title === "string" && preview.title.length > 0) {
		item.textContent = preview.title;
		item.title = `${preview.title} — ${key}`;
	}
}

let activeRoot: LoomReactRoot | undefined;
let activeKey: string | undefined;
let mountSeq = 0;

function unmountActive(): void {
	try {
		activeRoot?.unmount();
	} catch (error) {
		console.warn("[loom gallery] unmount failed:", error);
	}
	activeRoot = undefined;
}

async function mount(key: string): Promise<void> {
	const seq = ++mountSeq;
	activeKey = key;
	placeholder.hidden = true;
	clearError();
	unmountActive();
	for (const [k, item] of items) item.classList.toggle("active", k === key);

	let mod: TargetModule;
	try {
		mod = await loadTarget(key);
	} catch (error) {
		if (seq === mountSeq) showError(`failed to import ${key}`, error);
		return;
	}
	if (seq !== mountSeq) return; // superseded while awaiting

	let preview: PreviewExport;
	try {
		preview = getPreview(mod);
	} catch (error) {
		showError(`invalid preview export in ${key}`, error);
		return;
	}
	applyTitle(key, preview);

	const root = createRoot();
	activeRoot = root;
	try {
		root.render(
			React.createElement(
				ErrorBoundary,
				{
					onError: (error: unknown) => {
						if (seq === mountSeq) showError(`render error in ${key}`, error);
					},
				},
				// `preview.render` is `() => ReactElement` — exactly a function
				// component, so React re-renders (and re-throws into the boundary)
				// on its own schedule.
				React.createElement(preview.render as React.FunctionComponent),
			),
		);
	} catch (error) {
		showError(`render error in ${key}`, error);
	}
}

// ---------------------------------------------------------------------------
// Hash routing (#/relPath) — persists naturally across vite full reloads.
// ---------------------------------------------------------------------------

function currentHashKey(): string | undefined {
	if (!location.hash.startsWith("#/")) return undefined;
	const raw = location.hash.slice(2);
	if (raw === "") return undefined;
	try {
		return decodeURIComponent(raw);
	} catch {
		return raw;
	}
}

function route(): void {
	const key = currentHashKey();
	if (key !== undefined && Object.hasOwn(targets, key)) {
		void mount(key);
		return;
	}
	mountSeq += 1;
	activeKey = undefined;
	unmountActive();
	clearError();
	placeholder.hidden = false;
	for (const item of items.values()) item.classList.remove("active");
	if (key !== undefined) {
		showError(
			`unknown target: ${key}`,
			new Error("not in the discovered target list (was the file removed?)"),
		);
	}
}

window.addEventListener("hashchange", route);

// Last-resort containment: async errors that escape the boundary (e.g. thrown
// from the render promise chain or target module side effects) still paint the
// panel instead of dying silently in the console.
window.addEventListener("error", (event) => {
	if (activeKey !== undefined)
		showError(
			`uncaught error while showing ${activeKey}`,
			event.error ?? event.message,
		);
});
window.addEventListener("unhandledrejection", (event) => {
	if (activeKey !== undefined)
		showError(`unhandled rejection while showing ${activeKey}`, event.reason);
});

route();

// ---------------------------------------------------------------------------
// Lazy title upgrade: one target module per idle slice, in the background.
// Import failures just tint the sidebar item; the label stays the relPath.
// ---------------------------------------------------------------------------

const idle: (cb: () => void) => void =
	typeof requestIdleCallback === "function"
		? (cb) => requestIdleCallback(() => cb(), { timeout: 1000 })
		: (cb) => {
				setTimeout(cb, 250);
			};

const pendingTitles = [...keys];
function pumpTitles(): void {
	const key = pendingTitles.shift();
	if (key === undefined) return;
	void loadTarget(key)
		.then((mod) => applyTitle(key, getPreview(mod)))
		.catch(() => items.get(key)?.classList.add("failed"))
		.finally(() => idle(pumpTitles));
}
idle(pumpTitles);

// HMR: the shell holds live DOM + a mounted loom root, so a self-patch would
// double everything — let vite fall back to a full reload (the hash keeps the
// selection). Target edits bubble up to the same full reload.
if (import.meta.hot) {
	import.meta.hot.on("vite:beforeFullReload", () => {
		unmountActive();
	});
}
