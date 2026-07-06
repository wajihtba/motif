// Effects inspector — strictly scoped to what you're looking at:
//
//   • something selected → the effects ON that element, plus a live preview
//     grid of every effect that can apply to it (each thumbnail = the actual
//     element's pixels run through that effect);
//   • nothing selected  → the canvas (full-frame) effect stack, plus the same
//     preview grid rendered from the whole composition.
//
// Layout rules that keep it calm:
//   – applied layers are an accordion (one editor open at a time);
//   – the preview picker lives behind a "Browse effects" toggle and closes
//     itself after you pick — the new layer opens with its params right there,
//     no scrolling hunt;
//   – sliders are live (thumb follows the pointer, canvas updates during the
//     drag, one undo step per drag) and color params get real color pickers.

import { useEffect, useRef, useState } from "react"
import type { EditorController } from "@/controller"
import type { AnyEffectDef, EffectKind } from "@/effects/core/types"
import type {
  EffectLayer,
  EffectScope,
  ElementRole,
  Scene,
  SceneNode,
} from "@/scene/types"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { LOOKS } from "@/content/looks"
import { allEffects, findEffect, policyOf } from "@/effects/core/registry"
import "@/effects"
import { flatten } from "@/scene/model"
import { useEditorState } from "@/hooks/use-document-store"
import { ColorField, LiveSlider } from "./fx-controls"
import { useEffectPreviews } from "./use-effect-previews"

const KIND_LABEL: Record<string, string> = {
  "scene-shader": "Scene shaders",
  "element-shader": "Element shaders",
  pixel: "Pixel",
  filter: "Filters",
}
const FX_KINDS: EffectKind[] = [
  "scene-shader",
  "element-shader",
  "pixel",
  "filter",
]

const SCOPE_LABEL: Record<EffectScope, string> = {
  box: "Whole box",
  content: "Element shape",
  text: "Text only",
  image: "Image only",
}

/** Role groups behind the "protect" chips on full-frame layers. */
const PROTECT_GROUPS: Array<{ label: string; roles: ElementRole[] }> = [
  { label: "Text", roles: ["eyebrow", "headline", "subhead", "price", "meta"] },
  { label: "CTA", roles: ["cta", "badge"] },
  { label: "Images", roles: ["image"] },
]

export function EffectsPanel({ ctrl }: { ctrl: EditorController }) {
  const state = useEditorState(ctrl)
  const scene = state.document.scene
  const selection = state.selection
  const primary = selection.length
    ? (selection[selection.length - 1] ?? null)
    : null

  const layers = primary
    ? scene.effects.filter(
        (l) =>
          l.target.type === "elements" &&
          l.target.ids.some((id) => selection.includes(id))
      )
    : scene.effects.filter((l) => l.target.type === "canvas")

  const defs = allEffects(FX_KINDS).filter((d) =>
    policyOf(d).targets.includes(primary ? "element" : "canvas")
  )

  // One layer editor open at a time; the freshly added layer takes the slot.
  const [openId, setOpenId] = useState<string | null>(null)
  const [browsing, setBrowsing] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  // Auto-collapse the browser when the context switches.
  const ctxKey = primary ?? "canvas"
  const prevCtx = useRef(ctxKey)
  if (prevCtx.current !== ctxKey) {
    prevCtx.current = ctxKey
    setBrowsing(false)
    setOpenId(null)
  }

  const addEffect = (d: AnyEffectDef) => {
    const r = ctrl.dispatch({
      command: "fx.add",
      args: primary
        ? { effect: d.id, kind: d.kind } // target = selection
        : { effect: d.id, kind: d.kind, target: { type: "canvas" } },
    })
    if (!r.ok) return
    const id = r.returns[0] as string
    setBrowsing(false)
    setOpenId(id)
    // The new layer's editor renders at the top of the list — bring it in view.
    requestAnimationFrame(() =>
      listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    )
  }

  const node = primary ? findSceneNode(scene, primary) : undefined
  const currentLook = scene.effects.find((l) => l.owner === "look")

  return (
    <div className="space-y-3 p-3">
      <header ref={listRef}>
        <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
          {primary ? <>Effects on {nodeLabel(node, primary)}</> : "Canvas effects"}
        </p>
        <p className="text-[10px] text-muted-foreground">
          {primary
            ? selection.length > 1
              ? `${selection.length} elements selected — new effects apply to all.`
              : "Applied to this element only."
            : "Full-frame passes. Select an element to style it individually."}
        </p>
      </header>

      {!primary && (
        <div className="flex flex-wrap gap-1.5">
          {LOOKS.map((look) => (
            <button
              key={look.name}
              title={look.blurb}
              onClick={() =>
                ctrl.dispatch({
                  command: "look.apply",
                  args: { name: look.name },
                })
              }
              className="rounded-md border px-2 py-1 text-[11px] hover:border-primary/60"
            >
              {look.emoji} {look.label}
            </button>
          ))}
          {currentLook && (
            <button
              onClick={() =>
                ctrl.dispatch({ command: "look.apply", args: { name: "none" } })
              }
              className="rounded-md border border-destructive/40 px-2 py-1 text-[11px] text-destructive"
            >
              Clear look
            </button>
          )}
        </div>
      )}

      {layers.map((layer) => (
        <LayerRow
          key={layer.id}
          ctrl={ctrl}
          layer={layer}
          open={openId === layer.id}
          onToggle={() =>
            setOpenId(openId === layer.id ? null : layer.id)
          }
        />
      ))}
      {layers.length === 0 && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {primary
            ? "No effects on this element yet."
            : "No full-frame effects yet."}
        </p>
      )}

      <div className="border-t pt-2">
        <button
          onClick={() => setBrowsing(!browsing)}
          className="flex w-full items-center justify-between rounded-md border px-2.5 py-1.5 text-xs font-medium hover:border-primary/60"
        >
          <span>{browsing ? "Close" : "＋ Add effect"}</span>
          <span className="text-[10px] text-muted-foreground">
            {defs.length} available
          </span>
        </button>
        {browsing && (
          <PreviewGrid
            ctrl={ctrl}
            defs={defs}
            snapshotId={primary}
            onAdd={addEffect}
          />
        )}
      </div>
    </div>
  )
}

// --- preview picker -------------------------------------------------------------

/** Live thumbnails: the actual target pixels run through each effect. */
function PreviewGrid({
  ctrl,
  defs,
  snapshotId,
  onAdd,
}: {
  ctrl: EditorController
  defs: AnyEffectDef[]
  snapshotId: string | null
  onAdd: (def: AnyEffectDef) => void
}) {
  const { urls, refresh } = useEffectPreviews(ctrl, defs, snapshotId)

  return (
    <div className="space-y-2 pt-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-muted-foreground">
          Previews use your actual design
        </p>
        <button
          title="Refresh previews from the current design"
          onClick={refresh}
          className="rounded px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
        >
          ↻
        </button>
      </div>
      {FX_KINDS.map((kind) => {
        const items = defs.filter((d) => d.kind === kind)
        if (!items.length) return null
        return (
          <div key={kind} className="space-y-1.5">
            <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
              {KIND_LABEL[kind]}
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {items.map((d) => {
                const url = urls[`${d.kind}.${d.id}`]
                return (
                  <button
                    key={`${d.kind}.${d.id}`}
                    title={d.blurb ?? `${d.name} (${d.group})`}
                    onClick={() => onAdd(d)}
                    className="group overflow-hidden rounded-md border text-left transition-colors hover:border-primary"
                  >
                    {url ? (
                      <img
                        src={url}
                        alt=""
                        className="block aspect-[3/2] w-full object-cover"
                        draggable={false}
                      />
                    ) : (
                      <div className="aspect-[3/2] w-full animate-pulse bg-muted/50" />
                    )}
                    <span className="block truncate px-1.5 py-1 text-[10px] leading-tight">
                      {d.name}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// --- one applied effect layer ----------------------------------------------------

function LayerRow({
  ctrl,
  layer,
  open,
  onToggle,
}: {
  ctrl: EditorController
  layer: EffectLayer
  open: boolean
  onToggle: () => void
}) {
  const def = findEffect(layer.effect, layer.kind)?.def
  const patch = (p: Record<string, unknown>) =>
    ctrl.dispatch({ command: "fx.update", args: { id: layer.id, patch: p } })
  const policy = def ? policyOf(def) : undefined
  const rowRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open)
      rowRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }, [open])

  return (
    <div
      ref={rowRef}
      className="space-y-2 rounded-lg border bg-muted/30 px-2.5 py-2"
    >
      <div className="flex items-center gap-2">
        <Switch
          checked={layer.enabled}
          onCheckedChange={(enabled) => patch({ enabled })}
          className="scale-75"
        />
        <button
          className="flex-1 truncate text-left text-xs font-medium"
          onClick={onToggle}
        >
          {def?.name ?? layer.effect}
          <span className="ml-1 text-[10px] text-muted-foreground">
            {open ? "▾" : "▸"}
          </span>
        </button>
        <div className="flex">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() =>
              ctrl.dispatch({
                command: "fx.reorder",
                args: { id: layer.id, direction: "up" },
              })
            }
          >
            ↑
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() =>
              ctrl.dispatch({
                command: "fx.reorder",
                args: { id: layer.id, direction: "down" },
              })
            }
          >
            ↓
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-muted-foreground"
            onClick={() =>
              ctrl.dispatch({ command: "fx.remove", args: { id: layer.id } })
            }
          >
            ✕
          </Button>
        </div>
      </div>

      {open && def && (
        <div className="space-y-2.5 pt-1">
          {layer.target.type === "canvas" && (
            <ProtectChips layer={layer} patch={patch} />
          )}
          {policy &&
            policy.scopes.length > 1 &&
            layer.target.type !== "canvas" && (
              <div className="flex items-center gap-2">
                <Label className="text-[11px] text-muted-foreground">
                  Apply to
                </Label>
                <Select
                  value={layer.scope}
                  onValueChange={(scope) => patch({ scope })}
                >
                  <SelectTrigger className="h-7 flex-1 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {policy.scopes.map((s) => (
                      <SelectItem key={s} value={s}>
                        {SCOPE_LABEL[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          {def.params.map((p) =>
            p.type === "color" ? (
              <ColorField
                key={p.key}
                ctrl={ctrl}
                label={p.label}
                value={layer.params[p.key] ?? p.def}
                gestureLabel={`Adjust ${def.name} ${p.label}`}
                onApply={(v) => patch({ params: { [p.key]: v } })}
              />
            ) : (
              <LiveSlider
                key={p.key}
                ctrl={ctrl}
                label={p.label}
                min={p.min}
                max={p.max}
                step={p.step}
                value={layer.params[p.key] ?? p.def}
                gestureLabel={`Adjust ${def.name} ${p.label}`}
                onApply={(v) => patch({ params: { [p.key]: v } })}
              />
            )
          )}
          {"animated" in def && def.animated && (
            <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <Switch
                checked={layer.animate}
                onCheckedChange={(animate) => patch({ animate })}
                className="scale-75"
              />
              Animate over time
            </label>
          )}
          {layer.effect === "custom" && <CustomGlsl ctrl={ctrl} layer={layer} />}
        </div>
      )}
    </div>
  )
}

/** Quick role-group toggles for full-frame protection (layer.exclude.roles).
 *  Lit = every role in the group is currently protected. */
function ProtectChips({
  layer,
  patch,
}: {
  layer: EffectLayer
  patch: (p: Record<string, unknown>) => void
}) {
  const excluded = new Set(layer.exclude?.roles ?? [])
  const toggle = (roles: ElementRole[], on: boolean) => {
    const next = new Set(excluded)
    for (const r of roles) {
      if (on) next.add(r)
      else next.delete(r)
    }
    patch({ exclude: { roles: [...next], ids: layer.exclude?.ids ?? [] } })
  }
  return (
    <div className="flex items-center gap-1.5">
      <Label className="text-[11px] text-muted-foreground">Protect</Label>
      {PROTECT_GROUPS.map(({ label, roles }) => {
        const on = roles.every((r) => excluded.has(r))
        return (
          <button
            key={label}
            title={`Keep ${label.toLowerCase()} crisp above this effect`}
            onClick={() => toggle(roles, !on)}
            className={
              on
                ? "rounded-full border border-primary/60 bg-primary/10 px-2 py-0.5 text-[10px] text-primary"
                : "rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground hover:border-primary/40"
            }
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

function CustomGlsl({
  ctrl,
  layer,
}: {
  ctrl: EditorController
  layer: EffectLayer
}) {
  const [draft, setDraft] = useState(layer.frag ?? "")
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground">
        GLSL — vec4 fx()
      </Label>
      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft === layer.frag) return
          const r = ctrl.dispatch({
            command: "fx.update",
            args: { id: layer.id, patch: { frag: draft } },
          })
          setError(r.ok ? null : r.errors.join("\n"))
        }}
        className="min-h-28 font-mono text-[11px]"
        spellCheck={false}
      />
      {error && (
        <pre className="text-[10px] whitespace-pre-wrap text-destructive">
          {error}
        </pre>
      )}
    </div>
  )
}

// --- helpers ----------------------------------------------------------------------

function findSceneNode(scene: Scene, id: string): SceneNode | undefined {
  if (scene.root.id === id) return scene.root
  return flatten(scene.root).find((n) => n.id === id)
}

function nodeLabel(node: SceneNode | undefined, id: string): string {
  if (!node) return `#${id}`
  return node.role && node.role !== "group" ? `${node.role} (#${id})` : `#${id}`
}
