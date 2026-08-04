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
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { prerenderImages } from "./prerender.ts";

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
