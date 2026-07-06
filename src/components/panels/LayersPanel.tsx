// Layers tree — the scene hierarchy as a Figma-style outline. It is a pure
// projection of the ONE source of truth: it reads `scene.root` + `selection`
// from the document store and writes exclusively through the command seam
// (element.select / setHidden / setLocked / move). Because the canvas overlay
// reads the SAME `selection`, selecting here highlights there and vice-versa
// for free — no second selection model exists.
//
// Rows render in real child-array order, so the tree mirrors the Code tab's
// JSON exactly (both are views of the same scene file). Drag reorders/reparents
// through element.move; dropping a node onto its own descendant is rejected by
// the command (cycle guard), so the UI can stay optimistic.

import { useMemo, useRef, useState } from "react"
import type { EditorController } from "@/controller"
import type { SceneNode } from "@/scene/types"
import type { HoverStore } from "@/hooks/use-hover"
import type { DropPos, DropTarget } from "./layers-move"
import { walk } from "@/scene/model"
import { cn } from "@/lib/utils"
import { useEditorState } from "@/hooks/use-document-store"
import { useHoverId } from "@/hooks/use-hover"
import { setInspectorTab } from "@/hooks/use-inspector-tab"
import { computeLayerMove } from "./layers-move"

export function LayersPanel({
  ctrl,
  hover,
}: {
  ctrl: EditorController
  hover: HoverStore
}) {
  const state = useEditorState(ctrl)
  const scene = state.document.scene
  const root = scene.root
  const selection = state.selection

  // Nodes any enabled effect layer resolves to — drives the row "fx" badge.
  const fxIds = useMemo(() => {
    const ids = new Set<string>()
    for (const layer of scene.effects) {
      if (!layer.enabled) continue
      if (layer.target.type === "elements")
        for (const id of layer.target.ids) ids.add(id)
    }
    return ids
  }, [scene.effects])
  const canvasFx = scene.effects.some(
    (l) => l.enabled && l.target.type === "canvas"
  )

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [dragId, setDragId] = useState<string | null>(null)
  const [drop, setDrop] = useState<DropTarget | null>(null)
  // Anchor for shift-range selection (last row the user plain/⌘-clicked).
  const anchorRef = useRef<string | null>(null)

  // The visible rows in top-to-bottom order (respecting collapse) — the domain
  // for shift-range selection.
  const visibleOrder = useMemo(() => {
    const out: string[] = []
    const visit = (nodes: SceneNode[]) => {
      for (const n of nodes) {
        out.push(n.id)
        if (n.children?.length && !collapsed.has(n.id)) visit(n.children)
      }
    }
    visit(root.children ?? [])
    return out
  }, [root, collapsed])

  const toggleCollapse = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const select = (id: string, e: React.MouseEvent) => {
    const mod = e.metaKey || e.ctrlKey
    if (e.shiftKey && anchorRef.current) {
      const a = visibleOrder.indexOf(anchorRef.current)
      const b = visibleOrder.indexOf(id)
      if (a !== -1 && b !== -1) {
        const [lo, hi] = a < b ? [a, b] : [b, a]
        ctrl.dispatch({
          command: "element.select",
          args: { ids: visibleOrder.slice(lo, hi + 1) },
        })
        return
      }
    }
    if (mod) {
      const next = selection.includes(id)
        ? selection.filter((s) => s !== id)
        : [...selection, id]
      ctrl.dispatch({ command: "element.select", args: { ids: next } })
    } else {
      ctrl.dispatch({ command: "element.select", args: { ids: [id] } })
    }
    anchorRef.current = id
  }

  const onDrop = () => {
    const target = drop
    const moving = dragId
    setDrag(null)
    if (!moving || !target) return
    const move = computeLayerMove(
      ctrl.store.state.document.scene,
      moving,
      target
    )
    if (!move) return
    ctrl.dispatch(
      { command: "element.move", args: { id: moving, ...move } },
      { label: "Reorder layer" }
    )
  }

  function setDrag(id: string | null) {
    setDragId(id)
    if (id === null) setDrop(null)
  }

  const children = root.children ?? []

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      onMouseLeave={() => hover.setHover(null)}
    >
      <div className="flex-1 overflow-y-auto py-1">
        {/* Canvas pseudo-layer: selects the whole-canvas context (empty
            selection) so page background, full-frame effects, and their
            protect settings are always one click away. */}
        <div
          onClick={() =>
            ctrl.dispatch({ command: "element.select", args: { ids: [] } })
          }
          className={cn(
            "group relative mb-1 flex h-7 cursor-default items-center gap-1.5 border-b pr-1.5 pl-1.5 text-xs select-none",
            selection.length === 0
              ? "bg-primary/15 text-foreground"
              : "hover:bg-muted/40"
          )}
        >
          {selection.length === 0 && (
            <span className="absolute top-0 bottom-0 left-0 w-0.5 bg-primary" />
          )}
          <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
            ▣
          </span>
          <span className="min-w-0 flex-1 truncate font-medium">Canvas</span>
          {canvasFx && (
            <button
              type="button"
              title="Has full-frame effects — open the Effects tab"
              onClick={(e) => {
                e.stopPropagation()
                ctrl.dispatch({ command: "element.select", args: { ids: [] } })
                setInspectorTab("effects")
              }}
              className="shrink-0 rounded-sm bg-primary/15 px-1 text-[9px] font-semibold tracking-wide text-primary uppercase"
            >
              fx
            </button>
          )}
        </div>
        {children.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            No layers yet. Generate a design in chat, or add elements on the
            canvas.
          </p>
        ) : (
          <ul
            role="tree"
            // Clicking the empty gutter clears the selection.
            onClick={(e) => {
              if (e.target === e.currentTarget)
                ctrl.dispatch({ command: "element.select", args: { ids: [] } })
            }}
          >
            {children.map((n) => (
              <LayerRow
                key={n.id}
                ctrl={ctrl}
                hover={hover}
                node={n}
                depth={0}
                selection={selection}
                fxIds={fxIds}
                collapsed={collapsed}
                toggleCollapse={toggleCollapse}
                onSelect={select}
                dragId={dragId}
                drop={drop}
                onDragStart={setDrag}
                onDragOverRow={setDrop}
                onDropRow={onDrop}
                onDragEnd={() => setDrag(null)}
              />
            ))}
          </ul>
        )}
      </div>
      <p className="shrink-0 border-t px-3 py-1.5 text-[10px] text-muted-foreground">
        {countNodes(root) - 1} layers · drag to reorder · ⇧/⌘ multi-select
      </p>
    </div>
  )
}

interface RowProps {
  ctrl: EditorController
  hover: HoverStore
  node: SceneNode
  depth: number
  selection: string[]
  fxIds: Set<string>
  collapsed: Set<string>
  toggleCollapse: (id: string) => void
  onSelect: (id: string, e: React.MouseEvent) => void
  dragId: string | null
  drop: DropTarget | null
  onDragStart: (id: string) => void
  onDragOverRow: (t: DropTarget | null) => void
  onDropRow: () => void
  onDragEnd: () => void
}

function LayerRow(props: RowProps) {
  const {
    ctrl,
    hover,
    node,
    depth,
    selection,
    fxIds,
    collapsed,
    toggleCollapse,
    onSelect,
    dragId,
    drop,
    onDragStart,
    onDragOverRow,
    onDropRow,
    onDragEnd,
  } = props
  const hovered = useHoverId(hover) === node.id
  const isSelected = selection.includes(node.id)
  const hasChildren = !!node.children?.length
  const isOpen = hasChildren && !collapsed.has(node.id)
  const isDragging = dragId === node.id
  const dropHere = drop?.id === node.id ? drop.pos : null

  const dispatch = (command: string, args: Record<string, unknown>) =>
    ctrl.dispatch({ command, args }, { source: "user" })

  return (
    <li role="treeitem" aria-selected={isSelected} aria-expanded={isOpen}>
      <div
        draggable={!node.locked}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move"
          e.dataTransfer.setData("text/plain", node.id)
          onDragStart(node.id)
        }}
        onDragEnd={onDragEnd}
        onDragOver={(e) => {
          if (!dragId || dragId === node.id) return
          e.preventDefault()
          const r = e.currentTarget.getBoundingClientRect()
          const y = (e.clientY - r.top) / r.height
          // A group accepts a "nest inside" drop in its middle band; a leaf is
          // only before/after.
          const pos: DropPos = hasChildren
            ? y < 0.25
              ? "before"
              : y > 0.75
                ? "after"
                : "inside"
            : y < 0.5
              ? "before"
              : "after"
          onDragOverRow({ id: node.id, pos })
        }}
        onDrop={(e) => {
          e.preventDefault()
          onDropRow()
        }}
        onClick={(e) => onSelect(node.id, e)}
        onMouseEnter={() => hover.setHover(node.id)}
        className={cn(
          "group relative flex h-7 cursor-default items-center gap-1 pr-1.5 text-xs select-none",
          isSelected
            ? "bg-primary/15 text-foreground"
            : hovered
              ? "bg-muted/60"
              : "hover:bg-muted/40",
          isDragging && "opacity-40",
          node.hidden && "text-muted-foreground/50"
        )}
        style={{ paddingLeft: 6 + depth * 14 }}
      >
        {/* drop indicator lines / nest ring */}
        {dropHere === "before" && <DropLine top />}
        {dropHere === "after" && <DropLine />}
        {dropHere === "inside" && (
          <span className="pointer-events-none absolute inset-0 rounded-sm ring-1 ring-primary ring-inset" />
        )}

        {/* selection accent bar */}
        {isSelected && (
          <span className="absolute top-0 bottom-0 left-0 w-0.5 bg-primary" />
        )}

        {/* caret */}
        {hasChildren ? (
          <button
            type="button"
            className="flex size-4 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation()
              toggleCollapse(node.id)
            }}
            aria-label={isOpen ? "Collapse" : "Expand"}
          >
            <Caret open={isOpen} />
          </button>
        ) : (
          <span className="size-4 shrink-0" />
        )}

        <TypeGlyph node={node} />

        <span className="min-w-0 flex-1 truncate">{nodeName(node)}</span>

        {/* fx badge — this node is targeted by an enabled effect layer;
            click selects it and jumps to the Effects tab */}
        {fxIds.has(node.id) && (
          <button
            type="button"
            title="Has effects — open the Effects tab"
            onClick={(e) => {
              e.stopPropagation()
              ctrl.dispatch({
                command: "element.select",
                args: { ids: [node.id] },
              })
              setInspectorTab("effects")
            }}
            className="shrink-0 rounded-sm bg-primary/15 px-1 text-[9px] font-semibold tracking-wide text-primary uppercase"
          >
            fx
          </button>
        )}

        {/* role tag */}
        {node.role && node.role !== "group" && (
          <span className="shrink-0 rounded-sm bg-muted px-1 text-[9px] tracking-wide text-muted-foreground uppercase opacity-0 group-hover:opacity-100">
            {node.role}
          </span>
        )}

        {/* lock toggle — visible when locked or on row hover */}
        <IconToggle
          active={!!node.locked}
          title={node.locked ? "Unlock" : "Lock"}
          onClick={() =>
            dispatch("element.setLocked", { id: node.id, locked: !node.locked })
          }
        >
          <LockIcon locked={!!node.locked} />
        </IconToggle>

        {/* visibility toggle — visible when hidden or on row hover */}
        <IconToggle
          active={!!node.hidden}
          title={node.hidden ? "Show" : "Hide"}
          onClick={() =>
            dispatch("element.setHidden", { id: node.id, hidden: !node.hidden })
          }
        >
          <EyeIcon off={!!node.hidden} />
        </IconToggle>
      </div>

      {isOpen && (
        <ul role="group">
          {node.children!.map((c) => (
            <LayerRow {...props} key={c.id} node={c} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  )
}

/** A small always-present control that reveals on row hover unless it is
 *  "active" (locked/hidden), in which case it stays visible as a status. */
function IconToggle({
  active,
  title,
  onClick,
  children,
}: {
  active: boolean
  title: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground",
        active ? "opacity-100" : "opacity-0 group-hover:opacity-100"
      )}
    >
      {children}
    </button>
  )
}

function DropLine({ top }: { top?: boolean }) {
  return (
    <span
      className="pointer-events-none absolute right-0 left-0 h-0.5 bg-primary"
      style={top ? { top: -1 } : { bottom: -1 }}
    />
  )
}

// --- naming & icons ----------------------------------------------------------

function nodeName(n: SceneNode): string {
  if (n.role && n.role !== "group") return capitalize(n.role)
  if (n.children?.length) return n.role === "group" ? "Group" : "Group"
  if (n.image) return "Image"
  if (n.html != null) {
    const text = n.html.replace(/<[^>]*>/g, "").trim()
    if (text) return text.length > 28 ? text.slice(0, 28) + "…" : text
  }
  return n.tag ?? "Layer"
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function countNodes(root: SceneNode): number {
  let n = 0
  walk(root, () => {
    n += 1
  })
  return n
}

function Caret({ open }: { open: boolean }) {
  return (
    <svg
      width="8"
      height="8"
      viewBox="0 0 8 8"
      fill="currentColor"
      style={{ transform: open ? "rotate(90deg)" : "none" }}
    >
      <path d="M2 1l4 3-4 3z" />
    </svg>
  )
}

/** Tiny type indicator so image / group / text read at a glance. */
function TypeGlyph({ node }: { node: SceneNode }) {
  const cls = "size-3.5 shrink-0 text-muted-foreground"
  if (node.image)
    return (
      <svg
        className={cls}
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
      >
        <rect x="2" y="3" width="12" height="10" rx="1.5" strokeWidth="1.3" />
        <circle cx="6" cy="6.5" r="1.2" fill="currentColor" stroke="none" />
        <path d="M3 12l3.5-3 2.5 2 2-1.5L14 12" strokeWidth="1.3" />
      </svg>
    )
  if (node.children?.length)
    return (
      <svg
        className={cls}
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
      >
        <path
          d="M2 4.5A1.5 1.5 0 013.5 3H7l1.5 1.5H13A1.5 1.5 0 0114.5 6v5.5A1.5 1.5 0 0113 13H3.5A1.5 1.5 0 012 11.5z"
          strokeWidth="1.2"
        />
      </svg>
    )
  if (node.html != null)
    return (
      <svg
        className={cls}
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
      >
        <path d="M4 4h8M4 8h8M4 12h5" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    )
  return (
    <svg className={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor">
      <rect x="3" y="3" width="10" height="10" rx="1.5" strokeWidth="1.3" />
    </svg>
  )
}

function EyeIcon({ off }: { off: boolean }) {
  return off ? (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
    >
      <path
        d="M2 8s2.5-4 6-4 6 4 6 4-2.5 4-6 4-6-4-6-4z"
        strokeWidth="1.2"
        opacity="0.5"
      />
      <path d="M3 3l10 10" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  ) : (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
    >
      <path d="M2 8s2.5-4 6-4 6 4 6 4-2.5 4-6 4-6-4-6-4z" strokeWidth="1.2" />
      <circle cx="8" cy="8" r="1.6" strokeWidth="1.2" />
    </svg>
  )
}

function LockIcon({ locked }: { locked: boolean }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
    >
      <rect x="3.5" y="7" width="9" height="6" rx="1" strokeWidth="1.2" />
      <path
        d={locked ? "M5.5 7V5a2.5 2.5 0 015 0v2" : "M5.5 7V5a2.5 2.5 0 015 0"}
        strokeWidth="1.2"
      />
    </svg>
  )
}
