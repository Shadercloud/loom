/**
 * `richtext.ts` — Roblox `RichText` markup, parsed into styled runs.
 *
 * A text instance with `RichText = true` reads its `Text` as a small markup
 * language; with `RichText = false` the very same string is literal, tags and
 * all. So this only ever runs behind that flag, and the parser's job is to
 * reproduce the engine's reading of it — not HTML's.
 *
 * The output is a flat list of runs rather than a tree. Nesting only ever
 * *accumulates* style (`<b>bold <font color="#f00">and red</font></b>`), so a
 * style stack collapses the tree on the way through, and the renderer can emit
 * one `<span>` per run with no recursion. `document.createTextNode` puts the
 * text in, never `innerHTML`: scene text is app data, and it must not be able
 * to introduce elements the markup never described.
 *
 * Supported, matching the engine: `<b>`, `<i>`, `<u>`, `<s>`, `<br/>`,
 * `<font>` (`color`, `size`, `face`, `family`, `weight`, `transparency`),
 * `<uppercase>`/`<uc>`, `<smallcaps>`/`<sc>`, and the character entities.
 *
 * Deferred, and deliberately left literal rather than half-applied: `<stroke>`
 * and `<mark>`. Both paint outside the glyph box — a stroke needs per-run
 * `paint-order` work and a mark needs a background that follows line wrapping —
 * and a version that ignored their attributes would look like support.
 *
 * Anything the engine would not recognize (an unknown tag, an unterminated
 * `<`, a stray closing tag) stays verbatim in the text, which is also what
 * Roblox shows.
 */

/** The accumulated style of one run — every field set by an enclosing tag. */
export interface RichStyle {
	bold?: boolean;
	italic?: boolean;
	underline?: boolean;
	strike?: boolean;
	uppercase?: boolean;
	smallcaps?: boolean;
	/** `<font color>`, already a CSS color. */
	color?: string;
	/** `<font transparency>`, 0 = opaque, as in Roblox. */
	transparency?: number;
	/** `<font size>`, in pixels. */
	size?: number;
	/** `<font face>` — a legacy `Enum.Font` item name. */
	face?: string;
	/** `<font family>` — a font asset URI. */
	family?: string;
	/** `<font weight>` — a CSS weight number, or a Roblox weight name. */
	weight?: string;
}

/** A run of text, or the line break `<br/>` introduces. */
export type RichSegment =
	| { readonly kind: "text"; readonly text: string; readonly style: RichStyle }
	| { readonly kind: "break" };

const ENTITIES: Readonly<Record<string, string>> = {
	lt: "<",
	gt: ">",
	amp: "&",
	quot: '"',
	apos: "'",
};

/** `&lt;` / `&#60;` / `&#x3c;` → the character. Unknown entities stay literal. */
export function decodeEntities(text: string): string {
	if (!text.includes("&")) return text;
	return text.replace(
		/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
		(match, body: string) => {
			const named = ENTITIES[body.toLowerCase()];
			if (named !== undefined) return named;
			if (body.startsWith("#")) {
				const code =
					body[1]?.toLowerCase() === "x"
						? Number.parseInt(body.slice(2), 16)
						: Number.parseInt(body.slice(1), 10);
				// Surrogates and out-of-range code points would throw; leave them be.
				if (Number.isFinite(code) && code >= 0 && code <= 0x10ffff) {
					try {
						return String.fromCodePoint(code);
					} catch {
						return match;
					}
				}
			}
			return match;
		},
	);
}

/** `#RRGGBB` or `rgb(r,g,b)` → a CSS color; undefined when neither. */
function parseColor(value: string): string | undefined {
	const hex = /^#([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(value.trim());
	if (hex) return `#${hex[1]}`;
	const rgb = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i.exec(
		value.trim(),
	);
	if (rgb) return `rgb(${rgb[1]}, ${rgb[2]}, ${rgb[3]})`;
	return undefined;
}

/** Roblox `<font weight>` takes a name or a number; CSS wants the number. */
const WEIGHT_NAMES: Readonly<Record<string, string>> = {
	thin: "100",
	extralight: "200",
	light: "300",
	regular: "400",
	normal: "400",
	medium: "500",
	semibold: "600",
	bold: "700",
	extrabold: "800",
	heavy: "900",
};

function parseWeight(value: string): string | undefined {
	const name = WEIGHT_NAMES[value.trim().toLowerCase()];
	if (name !== undefined) return name;
	const numeric = Number.parseInt(value, 10);
	return Number.isFinite(numeric) && numeric >= 100 && numeric <= 900
		? String(numeric)
		: undefined;
}

/** `color="#fff" size='12' weight=bold` → a lookup table. */
function parseAttributes(source: string): Record<string, string> {
	const attrs: Record<string, string> = {};
	const re = /([a-z][\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi;
	let match = re.exec(source);
	while (match !== null) {
		const key = (match[1] ?? "").toLowerCase();
		attrs[key] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? "");
		match = re.exec(source);
	}
	return attrs;
}

/** The style a `<font …>` contributes on top of its enclosing run. */
function fontStyle(attrs: Record<string, string>): RichStyle {
	const style: RichStyle = {};
	const color = attrs.color === undefined ? undefined : parseColor(attrs.color);
	if (color !== undefined) style.color = color;
	if (attrs.transparency !== undefined) {
		const transparency = Number.parseFloat(attrs.transparency);
		if (Number.isFinite(transparency)) {
			style.transparency = Math.min(1, Math.max(0, transparency));
		}
	}
	if (attrs.size !== undefined) {
		const size = Number.parseFloat(attrs.size);
		if (Number.isFinite(size) && size > 0) style.size = size;
	}
	if (attrs.face !== undefined && attrs.face !== "") style.face = attrs.face;
	if (attrs.family !== undefined && attrs.family !== "") {
		style.family = attrs.family;
	}
	if (attrs.weight !== undefined) {
		const weight = parseWeight(attrs.weight);
		if (weight !== undefined) style.weight = weight;
	}
	return style;
}

/** Tags that only toggle a flag, plus their `RichStyle` key. */
const FLAG_TAGS: Readonly<Record<string, keyof RichStyle>> = {
	b: "bold",
	i: "italic",
	u: "underline",
	s: "strike",
	uppercase: "uppercase",
	uc: "uppercase",
	smallcaps: "smallcaps",
	sc: "smallcaps",
};

/** Every tag name the parser acts on; anything else is left as literal text. */
function isKnownTag(name: string): boolean {
	return name === "font" || name === "br" || name in FLAG_TAGS;
}

/**
 * Parse `source` as Roblox rich text. Only call this when the node's `RichText`
 * is on — with it off the string is literal and must not be parsed at all.
 */
export function parseRichText(source: string): RichSegment[] {
	const segments: RichSegment[] = [];
	const stack: RichStyle[] = [{}];
	let buffer = "";

	const top = (): RichStyle => stack[stack.length - 1] ?? {};
	const flush = (): void => {
		if (buffer === "") return;
		segments.push({
			kind: "text",
			text: decodeEntities(buffer),
			style: top(),
		});
		buffer = "";
	};

	let i = 0;
	while (i < source.length) {
		const open = source.indexOf("<", i);
		if (open < 0) {
			buffer += source.slice(i);
			break;
		}
		buffer += source.slice(i, open);
		const close = source.indexOf(">", open + 1);
		if (close < 0) {
			// Unterminated `<`: the rest is text, exactly as the engine shows it.
			buffer += source.slice(open);
			break;
		}

		const raw = source.slice(open + 1, close);
		const closing = raw.startsWith("/");
		const body = (closing ? raw.slice(1) : raw).replace(/\/$/, "");
		const name = (/^\s*([a-z][\w-]*)/i.exec(body)?.[1] ?? "").toLowerCase();

		if (!isKnownTag(name)) {
			buffer += source.slice(open, close + 1);
			i = close + 1;
			continue;
		}

		if (name === "br") {
			// Void: `</br>` is not a thing, and neither spelling carries style.
			if (!closing) {
				flush();
				segments.push({ kind: "break" });
			}
		} else if (closing) {
			// A stray close with nothing open is ignored, matching the engine's
			// leniency — it does not resurrect the tag as text.
			if (stack.length > 1) {
				flush();
				stack.pop();
			}
		} else {
			flush();
			const added =
				name === "font"
					? fontStyle(parseAttributes(body))
					: { [FLAG_TAGS[name] as string]: true };
			stack.push({ ...top(), ...added });
		}
		i = close + 1;
	}
	flush();
	return segments;
}

/**
 * The text the markup actually shows: tags dropped, entities decoded, `<br/>`
 * as a newline. What measurement and any text read-back should see.
 */
export function richTextToPlain(source: string): string {
	return parseRichText(source)
		.map((segment) => (segment.kind === "break" ? "\n" : segment.text))
		.join("");
}
