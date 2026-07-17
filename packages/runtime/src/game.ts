/**
 * `game.ts` — the `DataModel` root and its service directory.
 *
 * `game` is a real `LoomInstance` (`ClassName === "DataModel"`), so tree APIs
 * work on it, and `GetService` resolves registered singleton factories
 * (`services.ts` populates the registry and pre-builds the trees that
 * `WaitForChild` touches synchronously). Unknown services return a warned stub
 * instance rather than throwing, so a preview never dies on an exotic service.
 */
import {
	createInstance,
	type LoomInstance,
	registerClassMethods,
} from "./instance";

/** The `DataModel` face: `LoomInstance` plus the service accessor. */
export interface DataModel extends LoomInstance {
	GetService(name: string): LoomInstance;
}

const factories = new Map<string, () => LoomInstance>();
const singletons = new Map<string, LoomInstance>();

/** The fake place root every preview shares. */
export const game: DataModel = createInstance("DataModel", "Game") as DataModel;

/**
 * Register a service singleton factory. Called by `services.ts` at module
 * load; the factory runs at most once, on first `GetService`.
 */
export function registerService(
	name: string,
	factory: () => LoomInstance,
): void {
	factories.set(name, factory);
}

/** Resolve (and cache) a service singleton, parenting it under `game`. */
export function getService(name: string): LoomInstance {
	const cached = singletons.get(name);
	if (cached) return cached;
	const factory = factories.get(name);
	let service: LoomInstance;
	if (factory) {
		service = factory();
	} else {
		console.warn(
			`[loom] GetService("${name}") has no registered implementation — returning a stub instance`,
		);
		service = createInstance(name, name);
	}
	if (service.Parent === undefined) service.Parent = game;
	singletons.set(name, service);
	return service;
}

registerClassMethods("DataModel", {
	GetService: (_self: LoomInstance, name: string) => getService(name),
});
