// @vitest-environment node
/**
 * The client half of the asset route.
 *
 * `./asset-proxy.ts` serves `<base>__loom/asset/<id>`; the image resolver in
 * `./globals.ts` has to *build* that same URL, which it does from
 * `import.meta.env.BASE_URL`. Vite defines that by prepending an
 * `import.meta.env = {…}` assignment to modules whose transformed code names
 * `import.meta.env` outright — so binding `import.meta` to a variable first
 * (which the resolver used to do, to keep the widening cast off the property
 * read) suppressed the assignment. The read then hit the browser's own bare
 * `import.meta`, the base silently fell back to "/", and every asset 404'd
 * under a mounted gallery: the Next integration, the Astro embed, any
 * `--base`.
 *
 * Node environment: `./paths.ts` needs `import.meta.url` to be a real `file:`
 * URL, which it only is outside vitest's web transform.
 */
import { describe, expect, it } from "vitest";
import { GLOBALS_PATH, PREVIEW_SRC } from "./paths.ts";

async function transformGlobals(base: string): Promise<string> {
	const { createServer } = await import("vite");
	const server = await createServer({
		root: PREVIEW_SRC,
		base,
		configFile: false,
		logLevel: "silent",
		server: { middlewareMode: true },
	});
	try {
		const transformed = await server.transformRequest(`/@fs${GLOBALS_PATH}`);
		if (!transformed?.code) throw new Error("globals did not transform");
		return transformed.code;
	} finally {
		await server.close();
	}
}

describe("the image resolver's asset URL", () => {
	it("is built from the base Vite was configured with", async () => {
		const code = await transformGlobals("/loom-preview/");
		// Vite's own injection. Its *presence* is the contract being asserted:
		// without it the module reads an `import.meta` that has no `env` at all.
		expect(code).toMatch(
			/import\.meta\.env\s*=\s*\{[^}]*"BASE_URL":\s*"\/loom-preview\/"/,
		);
		expect(code).toContain("__loom/asset/");
	});

	it("still resolves at the default base", async () => {
		const code = await transformGlobals("/");
		expect(code).toMatch(/import\.meta\.env\s*=\s*\{[^}]*"BASE_URL":\s*"\/"/);
	});
});
