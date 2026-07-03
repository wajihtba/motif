// Inline text editing — a contenteditable overlay positioned over the node's
// measured box, styled from the measurement host's computed text styles so
// what you type looks like what paints. While open, the engine hides the
// node's canvas copy (setEditingNode); commit dispatches element.setHtml
// through the same gate as everything else (sanitized, one undo step).

import { useEffect, useRef } from "react"
import type { EditorController } from "@/controller"
import type { HtmlCanvasBackend } from "@/engine/html-canvas"

const COPIED_STYLES = [
  "font",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "lineHeight",
  "letterSpacing",
  "textAlign",
  "textTransform",
  "textShadow",
  "color",
  "padding",
  "borderRadius",
  "background",
  "display",
  "alignItems",
  "justifyContent",
  "flexDirection",
  "gap",
] as const

export function InlineTextEditor({
  ctrl,
  backend,
  nodeId,
  onClose,
}: {
  ctrl: EditorController
  backend: HtmlCanvasBackend
  nodeId: string
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const committed = useRef(false)
  const box = backend.measure(nodeId)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    backend.setEditingNode(nodeId)

    // Seed content + mirror the painted node's text styles.
    const host = backend.hostElOf(nodeId)
    el.innerHTML = host?.innerHTML ?? ""
    if (host) {
      const cs = getComputedStyle(host)
      for (const prop of COPIED_STYLES) {
        el.style[prop as never] = cs[prop as never]
      }
    }
    el.focus()
    // Caret at the end (double-click intent is usually "append/replace").
    const sel = window.getSelection()
    if (sel) {
      sel.selectAllChildren(el)
      sel.collapseToEnd()
    }

    return () => {
      backend.setEditingNode(null)
    }
  }, [backend, nodeId])

  const commit = () => {
    if (committed.current) return
    committed.current = true
    const html = ref.current?.innerHTML ?? ""
    backend.setEditingNode(null)
    ctrl.dispatch(
      { command: "element.setHtml", args: { id: nodeId, html } },
      { label: "Edit text" }
    )
    onClose()
  }

  const cancel = () => {
    if (committed.current) return
    committed.current = true
    backend.setEditingNode(null)
    onClose()
  }

  if (!box) return null
  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      data-motif="inline-editor"
      className="absolute outline-2 outline-primary"
      style={{
        left: box.x,
        top: box.y,
        minWidth: box.w,
        minHeight: box.h,
        zIndex: 10,
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation() // Delete/arrows must not hit canvas shortcuts
        if (e.key === "Escape") {
          e.preventDefault()
          cancel()
        }
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault()
          commit()
        }
      }}
      onPointerDown={(e) => e.stopPropagation()}
    />
  )
}
