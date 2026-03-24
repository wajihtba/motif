import { useEffect, useState, useCallback } from "react"
import { interaction, kernel, meta } from "~/lib/motif"

interface MenuPos {
  x: number
  y: number
  id: string
}

export function ContextMenu() {
  const [pos, setPos] = useState<MenuPos | null>(null)

  useEffect(() => {
    const onCtx = (e: MouseEvent) => {
      const hitId = interaction.hitTest(e.clientX, e.clientY)
      if (hitId) {
        e.preventDefault()
        interaction.select(hitId)
        setPos({ x: e.clientX, y: e.clientY, id: hitId })
      }
    }
    const onClose = () => setPos(null)

    window.addEventListener("contextmenu", onCtx)
    window.addEventListener("click", onClose)
    window.addEventListener("keydown", onClose)

    return () => {
      window.removeEventListener("contextmenu", onCtx)
      window.removeEventListener("click", onClose)
      window.removeEventListener("keydown", onClose)
    }
  }, [])

  const close = useCallback(() => setPos(null), [])

  if (!pos) return null

  const m = meta.get(pos.id)
  if (!m) return null

  return (
    <div
      className="m-context-menu"
      style={{ left: pos.x, top: pos.y }}
      onClick={(e) => e.stopPropagation()}
    >
      <button className="m-ctx-item" onClick={() => { interaction.duplicate(); close() }}>
        Duplicate <span className="m-ctx-shortcut">⌘D</span>
      </button>
      <button className="m-ctx-item" onClick={() => { interaction.startEdit(pos.id); close() }}>
        Edit Inline <span className="m-ctx-shortcut">⏎</span>
      </button>
      <div className="m-ctx-sep" />
      <button className="m-ctx-item" onClick={() => { kernel.reorder(pos.id, "up"); close() }}>Bring Forward</button>
      <button className="m-ctx-item" onClick={() => { kernel.reorder(pos.id, "down"); close() }}>Send Backward</button>
      <div className="m-ctx-sep" />
      {m.placement === "free" && (
        <button className="m-ctx-item" onClick={() => { kernel.wrapInFlex(pos.id); close() }}>Wrap in Flex</button>
      )}
      {m.placement === "flow" && (
        <button className="m-ctx-item" onClick={() => { kernel.detachFromLayout(pos.id); close() }}>Detach to Free</button>
      )}
      <button className="m-ctx-item" onClick={() => { interaction.toggleLock(); close() }}>
        {m.locked ? "Unlock" : "Lock"}
      </button>
      <div className="m-ctx-sep" />
      <button className="m-ctx-item danger" onClick={() => { interaction.deleteSel(); close() }}>
        Delete <span className="m-ctx-shortcut">⌫</span>
      </button>
    </div>
  )
}
