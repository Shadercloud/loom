// Ambient Roblox globals + JSX intrinsics for editor/typecheck. The loom plugin
// installs the globals at runtime; this only pulls in their *types* (and the
// <screengui>/<frame> JSX elements). A real roblox-ts project gets these from
// @rbxts/compiler-types instead.
import "@loom-dev/preview/globals";
