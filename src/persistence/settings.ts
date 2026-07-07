// Design-guard settings — app-level, localStorage-backed (documents and
// assets live in IndexedDB; UI preferences follow the StructureRail /
// gallery-ledger pattern: raw localStorage, try/catch-guarded, best-effort).
// Sparse by design: only deviations from the registry defaults are stored,
// so shipping a new rule later lights it up without a migration.

import type { GuardConfig, GuardRuleConfig, RuleId } from "../controller/guard/types"
import { DEFAULT_GUARD_CONFIG } from "../controller/guard/types"

const KEY = "motif:design-guard"

type Listener = () => void
const listeners = new Set<Listener>()

/** Memoized parse — invalidated by setGuardConfig and cross-tab storage
 *  events. getGuardConfig must be cheap: the agent loop and the debounced
 *  overlay both read it per pass. */
let cache: GuardConfig | null = null

function read(): GuardConfig {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULT_GUARD_CONFIG
    const parsed = JSON.parse(raw) as Partial<GuardConfig> | null
    if (!parsed || typeof parsed !== "object" || parsed.version !== 1) {
      return DEFAULT_GUARD_CONFIG
    }
    return {
      version: 1,
      rules:
        parsed.rules && typeof parsed.rules === "object" ? parsed.rules : {},
      agentAutofix:
        typeof parsed.agentAutofix === "boolean"
          ? parsed.agentAutofix
          : DEFAULT_GUARD_CONFIG.agentAutofix,
      visionJudge: {
        enabled: parsed.visionJudge?.enabled === true,
        extraCriteria: Array.isArray(parsed.visionJudge?.extraCriteria)
          ? parsed.visionJudge.extraCriteria.filter(
              (c): c is string => typeof c === "string"
            )
          : undefined,
      },
    }
  } catch {
    // Headless / private mode / corrupt JSON — defaults, never throw.
    return DEFAULT_GUARD_CONFIG
  }
}

export function getGuardConfig(): GuardConfig {
  cache ??= read()
  return cache
}

export interface GuardConfigPatch {
  rules?: Partial<Record<RuleId, GuardRuleConfig>>
  agentAutofix?: boolean
  visionJudge?: Partial<GuardConfig["visionJudge"]>
}

/** Shallow-merge a patch (rule entries merge per-rule), persist, notify. */
export function setGuardConfig(patch: GuardConfigPatch): void {
  const prev = getGuardConfig()
  const next: GuardConfig = {
    version: 1,
    rules: { ...prev.rules },
    agentAutofix: patch.agentAutofix ?? prev.agentAutofix,
    visionJudge: { ...prev.visionJudge, ...patch.visionJudge },
  }
  if (patch.rules) {
    for (const [id, entry] of Object.entries(patch.rules)) {
      const key = id as RuleId
      next.rules[key] = { ...next.rules[key], ...entry }
    }
  }
  cache = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Quota / private mode — keep the in-memory value for this session.
  }
  for (const fn of listeners) fn()
}

export function subscribeGuardConfig(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// Cross-tab sync: another tab's toggle invalidates this tab's cache.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY) return
    cache = null
    for (const fn of listeners) fn()
  })
}
