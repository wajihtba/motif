// React read of the persisted design-guard config (persistence/settings.ts)
// — same useSyncExternalStore seam as use-document-store, so toggling a rule
// re-renders exactly the consumers (overlay, auto-fix, guard menu).

import { useSyncExternalStore } from "react"
import type { GuardConfig } from "@/controller/guard/types"
import { getGuardConfig, subscribeGuardConfig } from "@/persistence/settings"

export function useGuardConfig(): GuardConfig {
  return useSyncExternalStore(subscribeGuardConfig, getGuardConfig, getGuardConfig)
}
