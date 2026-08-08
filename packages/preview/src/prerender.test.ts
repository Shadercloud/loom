// @vitest-environment node
/**
 * The build-time prerender, over a fixture that is exactly the case the scan
 * cannot solve: an icon component that *composes* its `rbxassetid://` from a
 * table of numbers, the shape every real roblox-ts UI library uses.
 *
 * Real Vite, real react adapter, real runtime — a mocked prerender would prove
 * nothing here, since what is being tested is that the whole stack runs outside
 * a browser at all.
 */
import {
	mkdirSync,
	mkdtempSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { pinResolutionUnder, prerenderImages } from "./prerender.ts";

const root = realpathSync(mkdtempSync(join(tmpdir(), "loom-prerender-")));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const write = (rel: string, code: string): void => {
	const parts = rel.split("/");
	if (parts.length > 1)
		mkdirSync(join(root, ...parts.slice(0, -1)), { recursive: true });
	writeFileSync(join(root, ...parts), code);
};

// The icon set: ids as bare numbers, reachable only by running the component.
write(
	"src/icons.ts",
	`export const ICONS = { close: 6031094678, check: 6031094667 } as const;\n`,
);
write(
	"src/Icon.tsx",
	`import React from "@rbxts/react";
import { ICONS } from "./icons";

export function Icon(props: { icon: keyof typeof ICONS }) {
	return <imagelabel Image={\`rbxassetid://\${ICONS[props.icon]}\`} />;
}
`,
);
write(
	"src/Composed.loom.tsx",
	`import React from "@rbxts/react";
import { Icon } from "./Icon";

// A hook, so the mount has to behave like a real render rather than a call.
function Scene() {
	const [icon] = React.useState<"close">("close");
	return (
		<screengui>
			<Icon icon={icon} />
			<imagelabel Image="https://cdn.test/plain.png" />
		</screengui>
	);
}

export const preview = { render: () => <Scene />, title: "Composed" } as const;
`,
);
// A literal id too, so the prerender is shown to cover the scan's ground as well.
write(
	"src/Literal.loom.tsx",
	`import React from "@rbxts/react";

export const preview = {
	render: () => (
		<screengui>
			<imagelabel Image="rbxassetid://1818" />
		</screengui>
	),
	title: "Literal",
} as const;
`,
);
// Throws on render: the build must survive it and keep the other targets' ids.
write(
	"src/Broken.loom.tsx",
	`export const preview = {
	render: () => {
		throw new Error("scene is broken");
	},
	title: "Broken",
} as const;
`,
);

describe("prerenderImages", () => {
	const warnings: string[] = [];
	let images: Set<string>;

	it("collects the images the mounted trees hold", async () => {
		images = await prerenderImages({
			root,
			patterns: ["**/*.loom.tsx"],
			warn: (message) => warnings.push(message),
		});
		// The composed id — the one the emitted bundle has nothing to match.
		expect(images).toContain("rbxassetid://6031094678");
		expect(images).toContain("rbxassetid://1818");
	});

	it("leaves plain URLs in, and never invents the ids a scene did not use", () => {
		expect(images).toContain("https://cdn.test/plain.png");
		// `ICONS.check` is in the module, but no scene renders it: baking the
		// whole icon table is exactly what this pass exists to avoid.
		expect(images).not.toContain("rbxassetid://6031094667");
	});

	it("warns about a target that will not render, without losing the others", () => {
		expect(warnings.join("\n")).toMatch(/Broken\.loom\.tsx/);
		expect(images).toContain("rbxassetid://6031094678");
	});

	it("returns nothing when no target matches", async () => {
		const none = await prerenderImages({
			root,
			patterns: ["**/*.nothing.tsx"],
			warn: () => undefined,
		});
		expect(none.size).toBe(0);
	});
});

/**
 * Issue #13. The CJS reconciler is loaded by node, where Vite's aliases do not
 * apply, so its own `require("react")` is answered by whatever sits beside it —
 * in an installed app, the host's React 19, which reconciler 0.29 cannot read.
 *
 * A workspace checkout resolves one react either way, so this drives the pin
 * over a fixture: two directories, each requiring the same id, only one of them
 * "the reconciler".
 */
describe("pinResolutionUnder", () => {
	const dir = join(root, "pin");
	mkdirSync(join(dir, "inside"), { recursive: true });
	mkdirSync(join(dir, "outside"), { recursive: true });
	writeFileSync(join(dir, "pinned.cjs"), "module.exports = 'pinned';\n");
	writeFileSync(join(dir, "real.cjs"), "module.exports = 'real';\n");
	writeFileSync(
		join(dir, "inside/ask.cjs"),
		"module.exports = () => require('../real.cjs');\n",
	);
	writeFileSync(
		join(dir, "outside/ask.cjs"),
		"module.exports = () => require('../real.cjs');\n",
	);

	const require_ = createRequire(import.meta.url);
	const inside = require_(join(dir, "inside/ask.cjs")) as () => string;
	const outside = require_(join(dir, "outside/ask.cjs")) as () => string;
	const pinned = new Map([["../real.cjs", join(dir, "pinned.cjs")]]);

	it("answers a require made from under the directory with the pinned file", () => {
		const undo = pinResolutionUnder(join(dir, "inside") + sep, pinned);
		try {
			expect(inside()).toBe("pinned");
			// The host's own modules keep resolving exactly as they did: the patch
			// is on a global loader, and a Next build is running in this process.
			expect(outside()).toBe("real");
		} finally {
			undo();
		}
	});

	it("puts node's resolver back", () => {
		pinResolutionUnder(join(dir, "inside") + sep, pinned)();
		delete require_.cache[require_.resolve(join(dir, "inside/ask.cjs"))];
		delete require_.cache[require_.resolve(join(dir, "pinned.cjs"))];
		expect((require_(join(dir, "inside/ask.cjs")) as () => string)()).toBe(
			"real",
		);
	});
});
