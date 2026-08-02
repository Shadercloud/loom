/**
 * `@loom-dev/renderer/fonts` — the Roblox font families that are openly
 * licensed, ready to register.
 *
 * A browser has none of the engine's typefaces, so by default every Roblox
 * family resolves to whatever the machine happens to have, and the same scene
 * measures — and therefore lays out — differently per OS. Importing this module
 * removes that for the families it covers: they are the *actual* fonts the
 * engine draws with, so the metrics are the engine's, not an approximation.
 *
 *     import "@loom-dev/renderer/fonts";
 *
 * The set is limited by what may be redistributed, not by what would be useful:
 *
 * | Roblox family | typeface | licence |
 * | --- | --- | --- |
 * | `SourceSans*` | Source Sans 3 | OFL-1.1 |
 * | `Roboto*` | Roboto | OFL-1.1 |
 * | `RobotoMono*` | Roboto Mono | OFL-1.1 |
 * | `Inconsolata` | Inconsolata | OFL-1.1 |
 *
 * `Gotham` — Roblox's default, and the family behind `Enum.Font.Gotham` and the
 * Builder faces that replaced it — is proprietary and cannot ship here. A
 * project that has the files registers them itself, with the same call this
 * module makes:
 *
 *     import { registerFont } from "@loom-dev/renderer";
 *     import gotham from "./Gotham-VF.woff2";
 *     registerFont("Gotham", {
 *       family: "Gotham",
 *       faces: [{ src: gotham, weight: "100 900" }],
 *     });
 *
 * The faces come from each package's own stylesheet rather than from
 * `registerFont`'s `faces`: Fontsource's CSS already declares the whole family
 * — every weight, both slants, per-script `unicode-range` subsets — with URLs
 * relative to itself, which is exactly what a bundler knows how to emit. So the
 * registration below only has to name the family the CSS declared.
 *
 * This module is browser-only and has a side effect on import (that is its
 * whole job), so it is a separate entry: a project that does not import it
 * ships none of it.
 */

import "@fontsource-variable/source-sans-3";
import "@fontsource-variable/roboto";
import "@fontsource-variable/roboto-mono";
import "@fontsource-variable/inconsolata";

import { registerFont } from "./fonts.ts";

registerFont("SourceSans", { family: "Source Sans 3 Variable" });
registerFont("Roboto", { family: "Roboto Variable" });
registerFont("RobotoMono", { family: "Roboto Mono Variable" });
registerFont("Inconsolata", { family: "Inconsolata Variable" });
