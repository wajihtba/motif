// Brand component barrel — importing this module registers every catalogue
// group (side effects), mirroring src/effects/index.ts. Import it anywhere
// the registry is queried.

import "./actions"
import "./badges"
import "./text"
import "./cards"
import "./lists"
import "./stats"
import "./decor"
import "./shapes"
import "./backgrounds"
import "./overlays"
import "./logo"

export * from "./types"
export {
  list,
  get,
  groups,
  register,
  registerAll,
  instantiate,
  defaultVariants,
  componentIdList,
  componentCatalogLine,
} from "./registry"
export type {
  InstantiateOpts,
  InstantiateResult,
  ComponentGroupBucket,
} from "./registry"
