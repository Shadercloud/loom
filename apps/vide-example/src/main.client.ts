// vide client entry: `mount` runs the component and renders into the preview DOM.
// `loom preview` generates the index.html that loads this; the plugin aliases
// @rbxts/vide -> the loom vide adapter and installs the Roblox globals.
import { mount } from "@rbxts/vide";
import { App } from "./App";

mount(App);
