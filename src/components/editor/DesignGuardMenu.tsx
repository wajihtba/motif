// The design-guard menu: per-rule toggles for the quality control loop
// (registry order, titles/descriptions straight from DESIGN_RULES — one
// source of truth), plus the two pipeline switches: deterministic auto-fix
// during AI generation and the experimental vision review round. Backed by
// the persisted app-level config (persistence/settings.ts) — the agent
// loop, the canvas overlay and the editor auto-fix all read the same
// toggles live.

import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Switch } from "@/components/ui/switch"
import { DESIGN_RULES, isRuleEnabled } from "@/controller/guard/registry"
import { setGuardConfig } from "@/persistence/settings"
import { useGuardConfig } from "@/hooks/use-guard-config"

export function DesignGuardMenu() {
  const config = useGuardConfig()
  const activeCount = DESIGN_RULES.filter((r) =>
    isRuleEnabled(r, config)
  ).length

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="text-xs">
          Guard · {activeCount}/{DESIGN_RULES.length}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b px-3 py-2">
          <div className="text-sm font-medium">Design guard</div>
          <div className="text-xs text-muted-foreground">
            Checks run after every AI change; math-fixable issues are
            repaired automatically, the rest go back to the assistant.
          </div>
        </div>
        <div className="max-h-80 overflow-y-auto px-3 py-2">
          {DESIGN_RULES.map((rule) => (
            <label
              key={rule.id}
              className="flex cursor-pointer items-start justify-between gap-3 py-1.5"
            >
              <span className="min-w-0">
                <span className="block text-xs font-medium">{rule.title}</span>
                <span className="block text-xs text-muted-foreground">
                  {rule.description}
                </span>
              </span>
              <Switch
                size="sm"
                className="mt-0.5 shrink-0"
                checked={isRuleEnabled(rule, config)}
                onCheckedChange={(enabled) =>
                  setGuardConfig({ rules: { [rule.id]: { enabled } } })
                }
              />
            </label>
          ))}
        </div>
        <div className="border-t px-3 py-2">
          <label className="flex cursor-pointer items-start justify-between gap-3 py-1.5">
            <span className="min-w-0">
              <span className="block text-xs font-medium">
                Auto-fix during AI generation
              </span>
              <span className="block text-xs text-muted-foreground">
                apply deterministic layout fixes silently before warning the
                assistant
              </span>
            </span>
            <Switch
              size="sm"
              className="mt-0.5 shrink-0"
              checked={config.agentAutofix}
              onCheckedChange={(agentAutofix) =>
                setGuardConfig({ agentAutofix })
              }
            />
          </label>
          <label className="flex cursor-pointer items-start justify-between gap-3 py-1.5">
            <span className="min-w-0">
              <span className="block text-xs font-medium">
                Vision review{" "}
                <span className="font-normal text-muted-foreground">
                  (experimental)
                </span>
              </span>
              <span className="block text-xs text-muted-foreground">
                after the checks pass, the assistant reviews a render of the
                design once per request — slower, costs extra tokens
              </span>
            </span>
            <Switch
              size="sm"
              className="mt-0.5 shrink-0"
              checked={config.visionJudge.enabled}
              onCheckedChange={(enabled) =>
                setGuardConfig({ visionJudge: { enabled } })
              }
            />
          </label>
        </div>
      </PopoverContent>
    </Popover>
  )
}
