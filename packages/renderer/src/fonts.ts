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
 * it installs an image resolver. Most of Roblox's list is openly licensed and
 * ships ready to register from `@loom-dev/renderer/fonts` — which the preview
 * loads for you. `Gotham` (and the Builder family behind it today) is
 * proprietary and cannot be redistributed, so a project that wants it exact
 * registers its own copy.
 *
 * Nothing here is required: with no registration the stacks below still resolve,
 * and {@link warnMissingFace} says once per family what the drift is.
 */

/** Generic stacks — the last resort behind every family. */
const SANS =
	'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const MONO = 'ui-monospace, "Roboto Mono", "SF Mono", Menlo, monospace';
const SERIF = 'Georgia, "Times New Roman", Times, serif';

/**
 * Every family the engine can name, and the stack its text falls back to.
 *
 * `aliases` are the *other* spellings that mean the same family. Roblox names
 * one family several ways: the legacy `Enum.Font` item folds the weight in
 * (`GothamBold`, `ArimoBold`, `BuilderSansMedium`) and `FontFace` carries the
 * asset's own family, which is sometimes a different word entirely
 * (`Enum.Font.Code` is the `Inconsolata` family). Every spelling is matched by
 * prefix, so the weight suffixes come along for free.
 *
 * A family's own name always heads its stack: on a machine that happens to have
 * the real font installed that is the right answer, and it costs nothing where
 * it is missing. `@loom-dev/renderer/fonts` puts a real face in front of it for
 * the families that may be redistributed.
 */
const FAMILIES: Record<string, { aliases?: readonly string[]; stack: string }> =
	{
		// --- the engine's defaults ------------------------------------------------
		Gotham: { aliases: ["GothamSSm"], stack: `"Gotham", ${SANS}` },
		BuilderSans: { stack: `"Builder Sans", ${SANS}` },
		SourceSans: {
			aliases: ["SourceSansPro"],
			stack: `"Source Sans 3", "Source Sans Pro", ${SANS}`,
		},
		Arial: { stack: `Arial, Arimo, Helvetica, ${SANS}` },
		Legacy: { aliases: ["LegacyArial"], stack: `Arial, Arimo, ${SANS}` },
		Arimo: { stack: `Arimo, Arial, ${SANS}` },
		// --- the Google families the engine ships ---------------------------------
		AmaticSC: { stack: `"Amatic SC", ${SANS}` },
		Bangers: { stack: `Bangers, ${SANS}` },
		Creepster: { stack: `Creepster, ${SANS}` },
		DenkOne: { stack: `"Denk One", ${SANS}` },
		Fondamento: { stack: `Fondamento, cursive, ${SERIF}` },
		FredokaOne: {
			aliases: ["Fredoka"],
			stack: `Fredoka, "Fredoka One", ${SANS}`,
		},
		GrenzeGotisch: { stack: `"Grenze Gotisch", ${SERIF}` },
		IndieFlower: { stack: `"Indie Flower", cursive, ${SANS}` },
		JosefinSans: { stack: `"Josefin Sans", ${SANS}` },
		Jura: { stack: `Jura, ${SANS}` },
		Kalam: { stack: `Kalam, cursive, ${SANS}` },
		LuckiestGuy: { stack: `"Luckiest Guy", ${SANS}` },
		Merriweather: { stack: `Merriweather, ${SERIF}` },
		Michroma: { stack: `Michroma, ${SANS}` },
		Nunito: { stack: `Nunito, ${SANS}` },
		Oswald: { stack: `Oswald, ${SANS}` },
		PatrickHand: { stack: `"Patrick Hand", cursive, ${SANS}` },
		PermanentMarker: { stack: `"Permanent Marker", cursive, ${SANS}` },
		RobotoCondensed: { stack: `"Roboto Condensed", ${SANS}` },
		RobotoMono: { stack: MONO },
		Roboto: { stack: `Roboto, ${SANS}` },
		Sarpanch: { stack: `Sarpanch, ${SANS}` },
		SpecialElite: { stack: `"Special Elite", ${MONO}` },
		TitilliumWeb: { stack: `"Titillium Web", ${SANS}` },
		Ubuntu: { stack: `Ubuntu, ${SANS}` },
		Inconsolata: { aliases: ["Code"], stack: `Inconsolata, ${MONO}` },
		// --- the rest: named, so they resolve and warn, but not redistributable ----
		Highway: { aliases: ["HighwayGothic"], stack: `"Highway Gothic", ${SANS}` },
		Bodoni: { stack: `"Bodoni MT", Didot, ${SERIF}` },
		Garamond: { stack: `Garamond, "EB Garamond", ${SERIF}` },
		Cartoon: { stack: `"Comic Neue", "Comic Sans MS", cursive, ${SANS}` },
		SciFi: { stack: `Zekton, ${SANS}` },
		Arcade: { stack: `"Press Start 2P", ${MONO}` },
		Fantasy: { stack: `Balthazar, ${SERIF}` },
		Antique: { stack: `"Sawarabi Mincho", ${SERIF}` },
	};

/**
 * Every spelling that reaches a family, longest first so a prefix match cannot
 * take `RobotoMono` for `Roboto` or `SourceSansPro` for `SourceSans`.
 */
const FAMILY_KEYS: ReadonlyArray<readonly [string, string]> = Object.entries(
	FAMILIES,
)
	.flatMap(([family, entry]) =>
		[family, ...(entry.aliases ?? [])].map(
			(spelling) => [spelling, family] as const,
		),
	)
	.sort(([a], [b]) => b.length - a.length);

/** The family a Roblox font name belongs to, or undefined for an unknown one. */
export function familyKey(name: string | undefined): string | undefined {
	if (!name) return undefined;
	return FAMILY_KEYS.find(([spelling]) => name.startsWith(spelling))?.[1];
}

/** Families that resolve to a font every machine already has. */
const SYSTEM_FAMILIES = new Set(["Arial", "Legacy"]);

/** What a family falls back to with no face registered for it. */
function defaultStack(key: string): string {
	return FAMILIES[key]?.stack ?? SANS;
}

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
	if (!registered) return defaultStack(key);
	const fallback = registered.fallback ?? defaultStack(key);
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
	// Not only from `registerFont`: a page that declares its own `@font-face`
	// for a family loom already names has nothing to register, and its faces
	// land just as late.
	watchFontLoads();
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

let notifyQueued = false;
function fireNotify(): void {
	notifyQueued = false;
	for (const listener of [...listeners]) {
		try {
			listener();
		} catch (err) {
			console.error("loom: font change listener failed:", err);
		}
	}
}

function scheduleNotify(): void {
	watchFontLoads();
	if (notifyQueued) return;
	notifyQueued = true;
	// For the stack change. The face itself is almost certainly not loaded yet:
	// nothing has asked the browser for it, and the canvas loom measures with
	// never will — `measureText` paints nothing, so it silently takes the
	// fallback rather than starting the download that rendering the text would.
	// {@link watchFontLoads} is what covers the load when it does happen.
	queueMicrotask(fireNotify);
}

/** Attached once, for as long as the page lives. See {@link watchFontLoads}. */
let watchingLoads = false;

/**
 * Re-notify at the end of every font loading cycle.
 *
 * This is the difference between a layout that settles on the registered face
 * and one left frozen in the fallback, and it is not the same as waiting on
 * `document.fonts.ready`. That property is one promise for the cycle *in flight
 * when it is read*. Read it while the document is still loading and it resolves
 * after the faces land — which is why a static build, where one bundle and one
 * stylesheet register everything before the document is done, has always come
 * out right. Read it a moment later, once the document has settled and no face
 * has been asked for yet, and it is already resolved: the listeners fire at
 * once, against the fallback, and the face that downloads seconds afterwards
 * notifies nobody. A dev server puts loom squarely on that side — the app boots
 * through a graph of separate module requests, long after the document
 * finished — and a lazily loaded scene, or a target switched in the gallery,
 * is on it whatever the build.
 *
 * `loadingdone` has no such window: it fires at the end of *each* cycle, so a
 * face that only starts downloading when text first paints in it is still
 * reported.
 */
function watchFontLoads(): void {
	if (watchingLoads) return;
	const fonts = (
		globalThis as {
			document?: {
				fonts?: {
					addEventListener?: (type: string, listener: () => void) => void;
				};
			};
		}
	).document?.fonts;
	if (!fonts?.addEventListener) return;
	watchingLoads = true;
	// Coalesced through the same microtask, so a cycle finishing several faces
	// re-lays-out once. `loadingerror` too: a face that failed is a family that
	// will be measured in the fallback from here on, and the layout still on
	// screen may have been measured expecting otherwise.
	const notify = (): void => {
		if (notifyQueued) return;
		notifyQueued = true;
		queueMicrotask(fireNotify);
	};
	fonts.addEventListener("loadingdone", notify);
	fonts.addEventListener("loadingerror", notify);
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
	// Both of these are Arial, which every machine has: nothing to load and so
	// nothing to warn about.
	if (!key || SYSTEM_FAMILIES.has(key) || warned.has(key) || seen.has(key))
		return;
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
	const fonts = (
		globalThis as {
			document?: { fonts?: { ready?: Promise<unknown>; status?: string } };
		}
	).document?.fonts;
	const ready = fonts?.ready;
	if (!ready) return;
	auditQueued = true;
	// A face still downloading is not missing, only late.
	void ready.then(() => {
		auditQueued = false;
		// `warnMissingFace` is called while the text is being encoded, so the
		// paint that asks the browser for the face may only just have started —
		// after the cycle this promise belongs to. Warning now would name a
		// family that is loading as we speak; wait for the cycle it is in.
		if (fonts?.status === "loading") {
			scheduleAudit();
			return;
		}
		for (const key of [...seen]) {
			seen.delete(key);
			if (warned.has(key) || registrations.has(key)) continue;
			// The family's own name heads every default stack; if the browser can
			// serve it, nothing is missing.
			const own = defaultStack(key).split(",")[0]?.trim();
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
