// Design inspector — selection-dependent properties. Every control dispatches
// the same commands the agent uses; the panel is a thin skin over the command
// surface (nothing here mutates the document directly).

import { useEffect, useState } from "react"
import type { EditorController } from "@/controller"
import type { Anchor } from "@/scene/layout"
import type { SceneNode } from "@/scene/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { ANCHORS } from "@/scene/layout"
import { findNode } from "@/scene/model"
import { THEME_PRESETS } from "@/scene/theme"
import { useEditorState } from "@/hooks/use-document-store"

export function DesignPanel({ ctrl }: { ctrl: EditorController }) {
  const state = useEditorState(ctrl)
  const scene = state.document.scene
  const primary = state.selection[state.selection.length - 1]
  const node = primary ? findNode(scene, primary) : null

  if (!node) {
    return (
      <div className="space-y-4 p-3">
        <SectionTitle>Scene</SectionTitle>
        <CommitInput
          label="Background"
          value={scene.background}
          onCommit={(value) =>
            ctrl.dispatch({ command: "scene.setBackground", args: { value } })
          }
        />
        <div className="space-y-1.5">
          <Label className="text-xs">Theme preset</Label>
          <Select
            onValueChange={(preset) =>
              ctrl.dispatch({ command: "scene.setTheme", args: { preset } })
            }
          >
            <SelectTrigger className="h-8 w-full text-sm">
              <SelectValue placeholder="Choose a theme…" />
            </SelectTrigger>
            <SelectContent>
              {THEME_PRESETS.map((p) => (
                <SelectItem key={p.name} value={p.name}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Select an element on the canvas to edit its layout, type and fill.
        </p>
      </div>
    )
  }

  return <NodeInspector key={node.id} ctrl={ctrl} node={node} />
}

function NodeInspector({
  ctrl,
  node,
}: {
  ctrl: EditorController
  node: SceneNode
}) {
  const set = (css: Record<string, string>) =>
    ctrl.dispatch({
      command: "element.setStyle",
      args: { id: node.id, css },
    })
  // css keys may be absent — display defaults to empty
  const cssOf = (key: string): string =>
    Object.hasOwn(node.css, key) ? node.css[key] : ""

  return (
    <div className="space-y-4 p-3">
      <div className="flex items-center gap-2">
        {node.role && <Badge>{node.role}</Badge>}
        <span className="truncate font-mono text-xs text-muted-foreground">
          #{node.id}
        </span>
      </div>

      <SectionTitle>Layout</SectionTitle>
      <AnchorPicker ctrl={ctrl} node={node} />

      <Separator />
      <SectionTitle>Type</SectionTitle>
      <div className="grid grid-cols-2 gap-2">
        <CommitInput
          label="Size"
          value={cssOf("fontSize")}
          placeholder="48px"
          onCommit={(v) => set({ fontSize: v })}
        />
        <div className="space-y-1.5">
          <Label className="text-xs">Weight</Label>
          <Select
            value={cssOf("fontWeight")}
            onValueChange={(v) => set({ fontWeight: v })}
          >
            <SelectTrigger className="h-8 w-full text-sm">
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              {["300", "400", "500", "600", "700", "800", "900"].map((w) => (
                <SelectItem key={w} value={w}>
                  {w}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <CommitInput
        label="Color"
        value={cssOf("color")}
        placeholder="var(--ink)"
        onCommit={(v) => set({ color: v })}
      />

      <Separator />
      <SectionTitle>Fill & border</SectionTitle>
      <CommitInput
        label="Background"
        value={cssOf("background")}
        placeholder="var(--primary) / gradient…"
        onCommit={(v) => set({ background: v })}
      />
      <div className="grid grid-cols-2 gap-2">
        <CommitInput
          label="Radius"
          value={cssOf("borderRadius")}
          placeholder="12px"
          onCommit={(v) => set({ borderRadius: v })}
        />
        <CommitInput
          label="Opacity"
          value={cssOf("opacity")}
          placeholder="1"
          onCommit={(v) => set({ opacity: v })}
        />
      </div>

      <Separator />
      <SectionTitle>Content</SectionTitle>
      {node.html != null && (
        <CommitTextarea
          label="HTML"
          value={node.html}
          onCommit={(html) =>
            ctrl.dispatch({
              command: "element.setHtml",
              args: { id: node.id, html },
            })
          }
        />
      )}

      <Separator />
      <Button
        variant="destructive"
        size="sm"
        className="w-full"
        onClick={() =>
          ctrl.dispatch({ command: "element.delete", args: { id: node.id } })
        }
      >
        Delete element
      </Button>
    </div>
  )
}

/** 3×3 anchor grid — an align control: clicking a cell MOVES the element to
 *  that region of its container (anchor with zero offsets), keeping its size.
 *  (It used to re-anchor in place, which changed nothing visible.) */
function AnchorPicker({
  ctrl,
  node,
}: {
  ctrl: EditorController
  node: SceneNode
}) {
  const layout = node.layout
  if (layout.mode !== "absolute") {
    return (
      <p className="text-xs text-muted-foreground">
        {layout.mode === "flow"
          ? "In flow — positioned by its parent stack."
          : "Auto-layout stack."}
      </p>
    )
  }
  const setAnchor = (anchor: Anchor) => {
    ctrl.dispatch({
      command: "element.setLayout",
      args: { id: node.id, layout: { ...layout, anchor, dx: 0, dy: 0 } },
    })
  }
  return (
    <div className="grid w-24 grid-cols-3 gap-1">
      {ANCHORS.map((a) => (
        <button
          key={a}
          title={a}
          onClick={() => setAnchor(a)}
          className={`h-6 rounded-sm border text-[10px] ${
            layout.anchor === a
              ? "border-primary bg-primary/20"
              : "border-border hover:bg-muted"
          }`}
        >
          ·
        </button>
      ))}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
      {children}
    </h3>
  )
}

/** Input that dispatches once on blur/Enter (not per keystroke). */
function CommitInput({
  label,
  value,
  placeholder,
  onCommit,
}: {
  label: string
  value: string
  placeholder?: string
  onCommit: (v: string) => void
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input
        className="h-8 text-sm"
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== value) onCommit(draft)
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur()
        }}
      />
    </div>
  )
}

function CommitTextarea({
  label,
  value,
  onCommit,
}: {
  label: string
  value: string
  onCommit: (v: string) => void
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Textarea
        className="min-h-20 font-mono text-xs"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== value) onCommit(draft)
        }}
      />
    </div>
  )
}
