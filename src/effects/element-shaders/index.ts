// Element-shader catalogue barrel. Importing this file self-registers every
// per-element shader def into the shared effect registry (so the engine / UI /
// agent can query them generically) and re-exports the combined, ordered list.
//
// Adding a shader = drop a def into its group file. Adding a group = create a
// new group file and splice its array in below.

import type { ElementShaderDef } from "../core/types"
import { registerAll } from "../core/registry"

import { basics } from "./basics"
import { glass } from "./glass"
import { metal } from "./metal"
import { textFx } from "./text-fx"
import { distortion } from "./distortion"
import { color } from "./color"
import { sparkle } from "./sparkle"
import { paper } from "./paper"

/** Every per-element shader def, `none` first, then grouped catalogues. */
export const ELEMENT_SHADERS: ElementShaderDef[] = [
  ...basics,
  ...glass,
  ...metal,
  ...textFx,
  ...distortion,
  ...color,
  ...sparkle,
  ...paper,
]

registerAll(ELEMENT_SHADERS)
