// Command registration. fx.* (M3), anim.* (M4), variant.*/look.*/export.*
// (M5/M6) register from their own modules when they land — the registry is
// designed for late registration and the agent tool schema regenerates from
// whatever is registered.

import { registerCommands } from "../types"
import { docCommands } from "./doc"
import { elementCommands } from "./element"
import { sceneCommands } from "./scene"

let registered = false

export function registerCoreCommands(): void {
  if (registered) return
  registered = true
  registerCommands(elementCommands)
  registerCommands(sceneCommands)
  registerCommands(docCommands)
}
