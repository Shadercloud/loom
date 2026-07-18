/**
 * `@rbxts/react` stand-in — plain react plus the roblox-only surface lattice-style
 * libraries touch: `React.Event` / `React.Change` keyed-prop namespaces
 * (`{ [React.Event.Activated]: fn }`). The minted keys carry loom prefixes the
 * `@loom-dev/react` adapter recognizes and routes to instance signals.
 *
 * Plain .js on purpose (`@types/react` is an `export =` module), and the react
 * API is re-exported by explicit destructuring: `export * from "react"` cannot
 * surface named exports across Vite's CJS interop, and patching the interop
 * views at runtime does not propagate (esbuild's `__toESM` snapshots keys).
 */
import { CHANGE_PROP_PREFIX, EVENT_PROP_PREFIX } from "@loom-dev/react";
import React from "react";

function keyedNamespace(prefix) {
	return new Proxy(
		{},
		{
			get(_target, name) {
				return typeof name === "string" ? `${prefix}${name}` : undefined;
			},
		},
	);
}

/** `React.Event.<SignalName>` → adapter-recognized keyed prop. */
export const Event = keyedNamespace(EVENT_PROP_PREFIX);
/** `React.Change.<PropertyName>` → adapter-recognized keyed prop. */
export const Change = keyedNamespace(CHANGE_PROP_PREFIX);

// The react 18 public API, re-exported as real ESM named exports.
export const {
	Children,
	Component,
	Fragment,
	Profiler,
	PureComponent,
	StrictMode,
	Suspense,
	cloneElement,
	createContext,
	createElement,
	createFactory,
	createRef,
	forwardRef,
	isValidElement,
	lazy,
	memo,
	startTransition,
	useCallback,
	useContext,
	useDebugValue,
	useDeferredValue,
	useEffect,
	useId,
	useImperativeHandle,
	useInsertionEffect,
	useLayoutEffect,
	useMemo,
	useReducer,
	useRef,
	useState,
	useSyncExternalStore,
	useTransition,
	version,
} = React;

/** Default export mirrors the named surface so `React.Event` works everywhere. */
const merged = Object.assign({}, React, { Event, Change });
export default merged;
