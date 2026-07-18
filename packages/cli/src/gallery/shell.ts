/**
 * Dev-server gallery boot. Pulls the target import map from the CLI-served
 * `virtual:loom-targets` module and hands it to the shared {@link startGallery}
 * shell. The static build (`loom build`) writes its own entry that imports a
 * real generated targets module instead — both call `startGallery` identically.
 *
 * Kept as a separate file (rather than folding into `gallery-shell.ts`) so the
 * `virtual:loom-targets` import — which only resolves under the dev server —
 * stays out of the shared, build-bundled shell module.
 */

import { targets } from "virtual:loom-targets";
import { startGallery } from "./gallery-shell";

startGallery(targets);
