/**
 * A minimal fine-grained reactive core, mirroring vide's `source`/`derive`/
 * `effect` primitives. Its only job is to track which effects read which sources,
 * so a source write re-runs exactly the effects that depend on it. The loom vide
 * adapter wires reactive props/children onto these so a source change reschedules
 * a Scene IR rebuild (see `index.ts`).
 *
 * Unlike React (a VDOM reconciler), vide is push-based: there is no diff, signals
 * notify their subscribers directly. Both paradigms feed the *same* Scene IR.
 *
 * Reactions form an ownership tree: an effect created while another reaction runs
 * becomes that reaction's child and is disposed when the parent re-runs (or when
 * the enclosing `root` is disposed). This is what keeps dynamic effects — e.g. a
 * `derive` or a reactive child rebuilt inside an effect — from leaking.
 */

type CleanupFn = () => void;

interface Reaction {
	run: () => void;
	/** Subscriber sets this reaction belongs to, cleared before each re-run. */
	deps: Set<Set<Reaction>>;
	cleanups: CleanupFn[];
	/** Effects created while this reaction was running; disposed before re-run. */
	children: Reaction[];
}

// The running reaction doubles as the current owner: dependency reads subscribe
// it, and effects created during its run nest under it.
let currentReaction: Reaction | undefined;

/** A vide source: call with no args to read (tracked), with one arg to write. */
export interface Source<T> {
	(): T;
	(value: T): T;
}

/** Create a reactive source seeded with `initial`. */
export function source<T>(initial: T): Source<T> {
	let value = initial;
	const subscribers = new Set<Reaction>();
	function accessor(...args: [T] | []): T {
		if (args.length === 0) {
			if (currentReaction) {
				subscribers.add(currentReaction);
				currentReaction.deps.add(subscribers);
			}
			return value;
		}
		value = args[0];
		// Snapshot: a reaction re-subscribes (mutating the set) as it re-runs.
		for (const reaction of [...subscribers]) reaction.run();
		return value;
	}
	return accessor as Source<T>;
}

function disposeReaction(reaction: Reaction): void {
	// Dispose nested effects first, depth-first, so their cleanups run too.
	for (const child of reaction.children) disposeReaction(child);
	reaction.children = [];
	for (const dep of reaction.deps) dep.delete(reaction);
	reaction.deps.clear();
	for (const fn of reaction.cleanups) fn();
	reaction.cleanups = [];
}

/** Run `fn` now and re-run it whenever a source it read changes. */
export function effect(fn: () => void): void {
	const reaction: Reaction = {
		run,
		deps: new Set(),
		cleanups: [],
		children: [],
	};
	function run(): void {
		// Tear down the previous run (deps, cleanups, and any nested effects) so a
		// re-run starts clean and dynamic children don't accumulate.
		disposeReaction(reaction);
		const prev = currentReaction;
		currentReaction = reaction;
		try {
			fn();
		} finally {
			currentReaction = prev;
		}
	}
	currentReaction?.children.push(reaction);
	run();
}

/** A memoized computation: a source kept in sync with `fn` via an effect. */
export function derive<T>(fn: () => T): () => T {
	const s = source<T>(undefined as T);
	effect(() => {
		s(fn());
	});
	return () => s();
}

/** Register a cleanup to run before the enclosing effect re-runs or disposes. */
export function cleanup(fn: CleanupFn): void {
	currentReaction?.cleanups.push(fn);
}

/**
 * Open a disposal scope. `fn` receives a `dispose` that tears down every effect
 * created within (recursively). `mount` runs the component tree inside a root so
 * unmounting disposes all its reactive bindings.
 */
export function root<T>(fn: (dispose: () => void) => T): T {
	const owner: Reaction = {
		run: () => {},
		deps: new Set(),
		cleanups: [],
		children: [],
	};
	const prev = currentReaction;
	currentReaction = owner;
	try {
		return fn(() => disposeReaction(owner));
	} finally {
		currentReaction = prev;
	}
}
