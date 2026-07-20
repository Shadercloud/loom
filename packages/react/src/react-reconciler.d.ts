// Minimal local typings for react-reconciler — only the surface loom uses. Avoids
// the @types/react-reconciler version-matching dance; the host config is verified
// against the running renderer in the browser.

declare module "react-reconciler" {
	export type OpaqueRoot = unknown;

	export interface ReactReconcilerInstance {
		createContainer(
			containerInfo: unknown,
			tag: number,
			hydrationCallbacks: unknown,
			isStrictMode: boolean,
			concurrentUpdatesByDefaultOverride: boolean | null,
			identifierPrefix: string,
			onRecoverableError: (error: unknown) => void,
			transitionCallbacks: unknown,
		): OpaqueRoot;
		updateContainer(
			element: unknown,
			container: OpaqueRoot,
			parentComponent?: unknown,
			callback?: (() => void) | null,
		): void;
		/**
		 * Build a `ReactPortal` element (`$$typeof: REACT_PORTAL_TYPE`) whose
		 * children commit into `containerInfo` through the host config's
		 * container methods (verified against react-reconciler 0.29.2:
		 * `createPortal(children, containerInfo, implementation, key = null)`).
		 */
		createPortal(
			children: unknown,
			containerInfo: unknown,
			implementation: unknown,
			key?: string | null,
		): unknown;
	}

	export default function ReactReconciler(
		config: unknown,
	): ReactReconcilerInstance;
}

// Spelled with the `.js` extension: react-reconciler 0.29 ships no `exports`
// map, so plain Node ESM (which the published build runs under) will not
// resolve the extensionless subpath. Bundlers accept both.
declare module "react-reconciler/constants.js" {
	export const DefaultEventPriority: number;
}
