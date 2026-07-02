// Scene-shader catalogue barrel. Importing this file self-registers every
// full-scene shader def into the shared effect registry (so the engine / UI /
// agent can query them generically) and re-exports the combined, ordered list.
//
// Adding a shader = drop a def into its group file. Adding a group = create a
// new group file and splice its array in below.

import type { SceneShaderDef } from "../core/types"
import { registerAll } from "../core/registry"

import { retro } from "./retro"
import { stylize } from "./stylize"
import { marketing } from "./marketing"

/** The "no shader" sentinel. Has an empty frag, so the scene stage skips it
 *  (renders the raw 2D canvas through with no WebGL pass) exactly as the legacy
 *  catalogue skipped the none/empty-frag program. */
const none: SceneShaderDef = {
  kind: "scene-shader",
  id: "none",
  name: "None",
  group: "Basics",
  animated: false,
  pointer: false,
  params: [],
  frag: "",
}

/** Every full-scene shader def, `none` first, then grouped catalogues. */
export const SCENE_SHADERS: SceneShaderDef[] = [
  none,
  ...retro,
  ...stylize,
  ...marketing,
]

registerAll(SCENE_SHADERS)
