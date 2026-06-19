// roblox-ts client entry: self-mounts via @rbxts/react-roblox. `loom preview`
// generates the index.html that loads this, and the plugin installs the globals.
import { createRoot } from "@rbxts/react-roblox";
import { App } from "./App";

createRoot().render(<App />);
