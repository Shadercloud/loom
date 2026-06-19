// roblox-ts-style entry: mount via @rbxts/react-roblox's createRoot. The loom
// plugin aliases it to the preview client and injects the globals; the Roblox
// target instance is ignored.
import { createRoot } from "@rbxts/react-roblox";
import { App } from "./App";

createRoot().render(<App />);
