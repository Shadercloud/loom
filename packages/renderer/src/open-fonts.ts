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
 * The preview imports it for you. A project embedding the adapters directly
 * does so itself, which is why this is a separate entry: the font packages sit
 * behind it, and a bundle that never imports it ships none of them.
 *
 * The set is limited by what may be redistributed, not by what would be useful.
 * Everything here is OFL-1.1 apart from Ubuntu, which is under the Ubuntu Font
 * Licence — redistributable on the terms that matter here.
 *
 * Not covered, and why:
 *
 * - **`Gotham`**, and the `BuilderSans` that replaced it as the engine default.
 *   Proprietary. A project that has the files registers them itself, with the
 *   same call this module makes:
 *
 *       import { registerFont } from "@loom-dev/renderer";
 *       import gotham from "./Gotham-VF.woff2";
 *       registerFont("Gotham", {
 *         family: "Gotham",
 *         faces: [{ src: gotham, weight: "100 900" }],
 *       });
 *
 * - **`Arial`** and **`Legacy`**. Every machine has Arial, and Arimo — which
 *   *is* registered here — is metric-compatible with it, so those stacks land
 *   on the right advance widths either way.
 * - **`Bodoni`, `Garamond`, `Cartoon`, `SciFi`, `Arcade`, `Fantasy`,
 *   `Antique`, `Highway`.** Loom knows the names, so they resolve to a stack
 *   and warn rather than drift silently, but the faces behind them are either
 *   licensed to Roblox or ones with no identity this module can vouch for.
 *
 * `FredokaOne` is the one approximation: Google folded "Fredoka One" into
 * Fredoka's heavier weights, so Fredoka is what registers for it.
 *
 * The faces come from each package's own stylesheet rather than from
 * `registerFont`'s `faces`: Fontsource's CSS already declares the whole family
 * — every weight, both slants, per-script `unicode-range` subsets — with URLs
 * relative to itself, which is exactly what a bundler knows how to emit. So the
 * registration below only has to name the family the CSS declared.
 *
 * This module is browser-only and has a side effect on import (that is its
 * whole job).
 */

import "@fontsource-variable/arimo";
import "@fontsource-variable/fredoka";
import "@fontsource-variable/grenze-gotisch";
import "@fontsource-variable/inconsolata";
import "@fontsource-variable/josefin-sans";
import "@fontsource-variable/jura";
import "@fontsource-variable/merriweather";
import "@fontsource-variable/nunito";
import "@fontsource-variable/oswald";
import "@fontsource-variable/roboto";
import "@fontsource-variable/roboto-condensed";
import "@fontsource-variable/roboto-mono";
import "@fontsource-variable/source-sans-3";
import "@fontsource/amatic-sc";
import "@fontsource/bangers";
import "@fontsource/creepster";
import "@fontsource/denk-one";
import "@fontsource/fondamento";
import "@fontsource/indie-flower";
import "@fontsource/kalam";
import "@fontsource/luckiest-guy";
import "@fontsource/michroma";
import "@fontsource/patrick-hand";
import "@fontsource/permanent-marker";
import "@fontsource/sarpanch";
import "@fontsource/special-elite";
import "@fontsource/titillium-web";
import "@fontsource/ubuntu";

import { registerFont } from "./fonts.ts";

/**
 * Roblox family → the CSS family the package imported above declares. The
 * `Variable` suffix is Fontsource's own naming for a variable face, not a
 * decoration: it is the string those stylesheets put in `font-family`.
 */
const OPEN_FACES: ReadonlyArray<readonly [string, string]> = [
	["SourceSans", "Source Sans 3 Variable"],
	["Roboto", "Roboto Variable"],
	["RobotoMono", "Roboto Mono Variable"],
	["RobotoCondensed", "Roboto Condensed Variable"],
	["Inconsolata", "Inconsolata Variable"],
	["Arimo", "Arimo Variable"],
	["FredokaOne", "Fredoka Variable"],
	["GrenzeGotisch", "Grenze Gotisch Variable"],
	["JosefinSans", "Josefin Sans Variable"],
	["Jura", "Jura Variable"],
	["Merriweather", "Merriweather Variable"],
	["Nunito", "Nunito Variable"],
	["Oswald", "Oswald Variable"],
	["AmaticSC", "Amatic SC"],
	["Bangers", "Bangers"],
	["Creepster", "Creepster"],
	["DenkOne", "Denk One"],
	["Fondamento", "Fondamento"],
	["IndieFlower", "Indie Flower"],
	["Kalam", "Kalam"],
	["LuckiestGuy", "Luckiest Guy"],
	["Michroma", "Michroma"],
	["PatrickHand", "Patrick Hand"],
	["PermanentMarker", "Permanent Marker"],
	["Sarpanch", "Sarpanch"],
	["SpecialElite", "Special Elite"],
	["TitilliumWeb", "Titillium Web"],
	["Ubuntu", "Ubuntu"],
];

for (const [roblox, family] of OPEN_FACES) registerFont(roblox, { family });
