/**
 * Roblox font family → the typeface the browser actually paints and measures
 * with.
 *
 * The engine ships its own fonts; a browser has none of them. Loom used to name
 * them in CSS (`font-family: "Gotham", system-ui, …`) and load nothing, so on a
 * machine without the font installed every Roblox family silently resolved to
 * `system-ui` — SF Pro on macOS, Segoe UI on Windows, Roboto on Linux. Three
 * different typefaces with three different advance widths, so the same scene
 * measured differently on each, and `AutomaticSize` and `TextWrapped` (which are
 * driven by that measurement) laid out differently with it.
 *
 * So the host installs the faces it has, with {@link registerFont}, the same way
 * it installs an image resolver. Two of Roblox's families are openly licensed
 * and ship ready to register from `@loom-dev/renderer/fonts`; `Gotham` (and the
 * Builder family behind it today) is proprietary and cannot be redistributed, so
 * a project that wants it exact registers its own copy.
 *
 * Nothing here is required: with no registration the stacks below still resolve,
 * and {@link warnMissingFace} says once per family what the drift is.
 */

/** Generic stacks — the last resort behind every family. */
const SANS =
	'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const MONO = 'ui-monospace, "Roboto Mono", "SF Mono", Menlo, monospace';

/**
 * Roblox names a family several ways — the legacy `Enum.Font` item folds the
 * weight in (`GothamBold`), and `FontFace` carries the asset's own family
 * (`GothamSSm`, `SourceSansPro`). Both identify the family by prefix, so one
 * key per family covers every spelling. Longest prefix first: `RobotoMono` must
 * not be read as `Roboto`.
 */
const FAMILY_KEYS = [
	"RobotoMono",
	"Roboto",
	"GothamSSm",
	"Gotham",
	"SourceSansPro",
	"SourceSans",
	"Inconsolata",
	"Arial",
	"Code",
] as const;

/** The family a Roblox font name belongs to, or undefined for an unknown one. */
export function familyKey(name: string | undefined): string | undefined {
	if (!name) return undefined;
	const key = FAMILY_KEYS.find((candidate) => name.startsWith(candidate));
	// The two-spelling families collapse onto one key, so a registration for
	// `Gotham` covers a `GothamSSm` FontFace and vice versa.
	if (key === "GothamSSm") return "Gotham";
	if (key === "SourceSansPro") return "SourceSans";
	return key;
}

/**
 * What each family falls back to unregistered. The Roblox name is still first:
 * on a machine that happens to have the real font installed it is the right
 * answer, and it costs nothing where it is missing.
 */
const DEFAULT_STACKS: Record<string, string> = {
	Gotham: `"Gotham", ${SANS}`,
	SourceSans: `"Source Sans 3", "Source Sans Pro", ${SANS}`,
	Roboto: `"Roboto", ${SANS}`,
	RobotoMono: MONO,
	Inconsolata: `"Inconsolata", ${MONO}`,
	Code: MONO,
	Arial: `Arial, ${SANS}`,
};

/** One `@font-face` the host can point loom at. */
export interface FontFaceSource {
	/** A URL the page can load — usually `new URL("…woff2", import.meta.url)`. */
	src: string;
	/** `"400"`, or a range like `"200 900"` for a variable font. Default `400`. */
	weight?: string | number;
	/** Default `"normal"`. */
	style?: "normal" | "italic";
	/** Default `"swap"` — paint in the fallback rather than not at all. */
	display?: "auto" | "block" | "swap" | "fallback" | "optional";
}

/** A typeface for one Roblox family. */
export interface FontRegistration {
	/**
	 * The CSS family name to paint and measure with. When `faces` is given this
	 * is also the name they are declared under.
	 */
	family: string;
	/**
	 * Faces to declare, for a family the page has not loaded itself. Omit when
	 * the page already provides it (a `<link>`, its own `@font-face`, or a font
	 * the machine has installed).
	 */
	faces?: readonly FontFaceSource[];
	/** Appended behind `family`. Defaults to the family's own default stack. */
	fallback?: string;
}

const registrations = new Map<string, FontRegistration>();
const listeners = new Set<() => void>();
/** Families already reported as unbacked, so the warning is once each. */
const warned = new Set<string>();

/** The CSS stack a Roblox font name paints with. */
export function familyStack(name: string | undefined): string {
	const key = familyKey(name);
	if (!key) return SANS;
	const registered = registrations.get(key);
	if (!registered) return DEFAULT_STACKS[key] ?? SANS;
	const fallback = registered.fallback ?? DEFAULT_STACKS[key] ?? SANS;
	return `${quoteFamily(registered.family)}, ${fallback}`;
}

/** `Source Sans 3` -> `"Source Sans 3"`; a bare identifier is left alone. */
function quoteFamily(family: string): string {
	if (/^[a-zA-Z][\w-]*$/.test(family)) return family;
	if (family.startsWith('"') || family.startsWith("'")) return family;
	return `"${family.replace(/"/g, '\\"')}"`;
}

/**
 * Install a typeface for one Roblox family (`"Gotham"`, `"SourceSans"`, … — any
 * spelling of the name, see {@link familyKey}).
 *
 * Registering after text has been painted is fine and expected: measurement runs
 * against whatever the browser has *now*, so a face that arrives late would
 * leave the first layout measured in the fallback. Loom re-lays-out once the
 * faces finish loading (see {@link onFontsChanged}), so the settled layout is
 * the one the registered face produces.
 */
export function registerFont(
	name: string,
	registration: FontRegistration,
): void {
	const key = familyKey(name) ?? name;
	registrations.set(key, registration);
	warned.delete(key);
	if (registration.faces?.length) {
		injectFaces(registration.family, registration.faces);
	}
	// Even with nothing to inject the stack changed, so anything measured
	// against the old one has to be measured again.
	scheduleNotify();
}

/** Drop every registration (and the `@font-face` rules loom added). */
export function clearRegisteredFonts(): void {
	registrations.clear();
	warned.clear();
	styleElement?.remove();
	styleElement = undefined;
	declared.clear();
	scheduleNotify();
}

let styleElement: HTMLStyleElement | undefined;
/** `family|weight|style|src` already declared, so a re-register is a no-op. */
const declared = new Set<string>();

function injectFaces(family: string, faces: readonly FontFaceSource[]): void {
	if (typeof document === "undefined") return;
	if (!styleElement) {
		styleElement = document.createElement("style");
		styleElement.dataset.loomFonts = "";
		document.head.appendChild(styleElement);
	}
	for (const face of faces) {
		const weight = String(face.weight ?? 400);
		const style = face.style ?? "normal";
		const id = `${family}|${weight}|${style}|${face.src}`;
		if (declared.has(id)) continue;
		declared.add(id);
		styleElement.appendChild(
			document.createTextNode(
				`@font-face{font-family:${quoteFamily(family)};` +
					`src:url(${JSON.stringify(face.src)});` +
					`font-weight:${weight};font-style:${style};` +
					`font-display:${face.display ?? "swap"};}\n`,
			),
		);
	}
}

/**
 * Run `listener` whenever the fonts loom measures with change — a registration,
 * or the browser finishing the download of one. The adapters subscribe to it and
 * re-measure, since every `AutomaticSize` text bound was computed against the
 * faces available at the time. Returns an unsubscribe.
 */
export function onFontsChanged(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

let notifyQueued = false;
function scheduleNotify(): void {
	if (notifyQueued) return;
	notifyQueued = true;
	const fire = (): void => {
		notifyQueued = false;
		for (const listener of [...listeners]) {
			try {
				listener();
			} catch (err) {
				console.error("loom: font change listener failed:", err);
			}
		}
	};
	// Once for the stack change, and again when the faces have actually loaded —
	// a swap-displayed face paints (and measures) as the fallback until then.
	queueMicrotask(fire);
	const fonts = (
		globalThis as { document?: { fonts?: { ready?: Promise<unknown> } } }
	).document?.fonts;
	if (fonts?.ready) void fonts.ready.then(fire);
}

/** Families some text has actually asked for, pending the check below. */
const seen = new Set<string>();
let auditQueued = false;

/**
 * Note that some text wants this Roblox family, so the audit below can say —
 * once — that nothing is loaded for it.
 *
 * Silence is what made this hard to see: the layout was simply different on a
 * different machine, with nothing pointing at the font as the reason. The check
 * itself waits for `document.fonts.ready`, since a face that is still
 * downloading is not missing, only late.
 */
export function warnMissingFace(name: string | undefined): void {
	const key = familyKey(name);
	// `Arial` is a system font everywhere; nothing to load and nothing to warn.
	if (!key || key === "Arial" || warned.has(key) || seen.has(key)) return;
	seen.add(key);
	scheduleAudit();
}

let probeCtx: CanvasRenderingContext2D | null | undefined;

/**
 * Whether the browser can actually paint `family`.
 *
 * Not `document.fonts.check()`: that answers "would this font specification
 * resolve", and an unknown family resolves — to the fallback — so it says yes
 * for a family nobody has. The width of a probe string is the thing that
 * actually differs. Rendered against two generics with wildly different metrics,
 * a real family shifts at least one of them; a missing one leaves both exactly
 * where the generic put them.
 */
function familyIsAvailable(family: string): boolean {
	if (probeCtx === undefined) {
		probeCtx =
			typeof document !== "undefined"
				? document.createElement("canvas").getContext("2d")
				: null;
	}
	const ctx = probeCtx;
	if (!ctx) return true; // nothing to measure with; assume the best and stay quiet
	const probe = "mmmmmmmmmmlliWWWW0123456789";
	for (const generic of ["monospace", "serif"]) {
		ctx.font = `72px ${generic}`;
		const base = ctx.measureText(probe).width;
		ctx.font = `72px ${family}, ${generic}`;
		if (ctx.measureText(probe).width !== base) return true;
	}
	return false;
}

function scheduleAudit(): void {
	if (auditQueued) return;
	const ready = (
		globalThis as { document?: { fonts?: { ready?: Promise<unknown> } } }
	).document?.fonts?.ready;
	if (!ready) return;
	auditQueued = true;
	// A face still downloading is not missing, only late.
	void ready.then(() => {
		auditQueued = false;
		for (const key of [...seen]) {
			seen.delete(key);
			if (warned.has(key) || registrations.has(key)) continue;
			// The family's own name heads every default stack; if the browser can
			// serve it, nothing is missing.
			const own = (DEFAULT_STACKS[key] ?? SANS).split(",")[0]?.trim();
			if (!own || familyIsAvailable(own)) continue;
			warned.add(key);
			console.warn(
				`loom: no face is loaded for the Roblox font family "${key}" — its ` +
					`text is painted and measured in the system fallback instead, ` +
					`which is a different typeface per OS and does not match the ` +
					`engine's layout. Register one with registerFont("${key}", ` +
					`{ family, faces }), or import "@loom-dev/renderer/fonts" for the ` +
					`families Roblox licenses openly.`,
			);
		}
	});
}
