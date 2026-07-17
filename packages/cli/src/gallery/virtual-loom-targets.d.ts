/** Ambient type for the CLI-served `virtual:loom-targets` import map. */
declare module "virtual:loom-targets" {
	export const targets: Record<string, () => Promise<Record<string, unknown>>>;
}
