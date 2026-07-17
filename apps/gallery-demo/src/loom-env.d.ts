// Ambient Roblox globals + JSX intrinsics for editor/typecheck. The loom
// plugin installs the globals at runtime; this only pulls in their *types*.
// The client import reaches @loom-dev/react, whose global JSX declaration
// provides the <screengui>/<frame>/... intrinsics (targets have no
// main.client.tsx to pull it in otherwise).
import "@loom-dev/preview/client";
import "@loom-dev/preview/globals";
