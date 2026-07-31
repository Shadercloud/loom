import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "happy-dom",
		include: ["packages/*/src/**/*.test.ts"],
		// The preview's package-compatibility tests boot real Vite dev servers and
		// run real Rollup builds. Each is well under a second on its own, but
		// several files running in parallel can push one past the 5s default —
		// a timeout that says nothing about the code under test.
		testTimeout: 30_000,
	},
});
