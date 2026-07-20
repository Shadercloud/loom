import { defineConfig, type UserConfig } from "tsdown";

/**
 * Shared build settings for every published loom package.
 *
 * All packages are `"type": "module"`, so the output keeps the plain `.js` /
 * `.d.ts` extensions the `exports` maps in each package.json point at — tsdown
 * would otherwise emit `.mjs` / `.d.mts`.
 */
export function loomBuild(config: UserConfig = {}): UserConfig {
	return defineConfig({
		entry: ["src/index.ts"],
		format: "esm",
		dts: true,
		sourcemap: true,
		clean: true,
		outExtensions: () => ({ js: ".js", dts: ".d.ts" }),
		...config,
	}) as UserConfig;
}
