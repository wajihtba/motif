// Raw scene editor — the scene file, live, both ways. Wraps vanilla-jsoneditor
// (the jsoneditoronline engine) which gives BOTH an interactive collapsible
// tree view and a CodeMirror text view behind one mode toggle.
//
// The document store is the single source of truth; this panel is one more
// view of it, on equal footing with the canvas:
//
//   editor → store   a valid edit is debounced, then dispatched through
//                    scene.apply — the SAME declarative command the agent's
//                    motif_generate uses. Invalid JSON never touches the scene.
//   store → editor   canvas / agent / undo edits are pushed into the editor,
//                    but ONLY while it is unfocused, so they never clobber an
//                    in-flight edit. On blur we reconcile to the normalized
//                    canonical scene (what the store actually holds).
//
// The focus gate is what makes the loop provably safe: our own scene.apply
// re-enters the store subscription, but we are focused at that moment, so the
// echo is dropped instead of fighting the caret.

import { useCallback, useEffect, useRef, useState } from "react"
import type { Content, JsonEditor } from "vanilla-jsoneditor"
import type { EditorController } from "@/controller"
import type { Scene } from "@/scene/types"
import "vanilla-jsoneditor/themes/jse-theme-dark.css"
import "./code-panel-theme.css"

type SyncState = "synced" | "editing" | "error"

export function CodePanel({ ctrl }: { ctrl: EditorController }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<JsonEditor | null>(null)
  const focusedRef = useRef(false)
  // The scene object identity we last pushed into the editor — lets us skip
  // redundant updates (immer gives a fresh identity only on real change).
  const pushedRef = useRef<Scene | null>(null)
  const applyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [status, setStatusState] = useState<SyncState>("synced")
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  // The editor callbacks are created once at mount, so they must read the
  // latest status through a ref rather than the captured render value.
  const statusRef = useRef<SyncState>("synced")
  const setStatus = useCallback((s: SyncState) => {
    statusRef.current = s
    setStatusState(s)
  }, [])

  // Mount the editor once (dynamic import keeps the browser-only lib out of the
  // SSR bundle) and wire it to the store. Torn down on unmount.
  useEffect(() => {
    let disposed = false
    let unsubscribe: (() => void) | null = null

    void import("vanilla-jsoneditor").then(({ createJSONEditor, Mode }) => {
      if (disposed || !hostRef.current) return
      const scene = ctrl.store.state.document.scene
      pushedRef.current = scene

      const editor = createJSONEditor({
        target: hostRef.current,
        props: {
          content: { json: scene },
          mode: Mode.tree,
          mainMenuBar: true,
          navigationBar: true,
          statusBar: true,
          onChange: (
            content: Content,
            _prev: Content,
            { contentErrors }: { contentErrors: unknown }
          ) => {
            // Any fresh edit invalidates a pending apply of stale content.
            if (applyTimer.current) clearTimeout(applyTimer.current)
            if (contentErrors) {
              setStatus("error")
              setErrorMsg(describeErrors(contentErrors))
              return
            }
            setStatus("editing")
            setErrorMsg(null)
            scheduleApply(content)
          },
          onFocus: () => {
            focusedRef.current = true
          },
          onBlur: () => {
            focusedRef.current = false
            // Reconcile to canonical truth once the caret leaves — but keep an
            // errored draft on screen so the user can fix it.
            if (statusRef.current !== "error")
              pushScene(ctrl.store.state.document.scene)
          },
        },
      })
      editorRef.current = editor

      // Store → editor: mirror external edits when we are not being typed into.
      unsubscribe = ctrl.store.subscribe(() => {
        const next = ctrl.store.state.document.scene
        if (next === pushedRef.current) return // our own echo, or no change
        if (focusedRef.current) return // never clobber an in-flight edit
        pushScene(next)
        setStatus("synced")
        setErrorMsg(null)
      })
    })

    return () => {
      disposed = true
      if (applyTimer.current) clearTimeout(applyTimer.current)
      unsubscribe?.()
      editorRef.current?.destroy()
      editorRef.current = null
    }
  }, [])

  /** Push a scene object into the editor, preserving expansion/scroll state. */
  function pushScene(scene: Scene) {
    pushedRef.current = scene
    editorRef.current?.update({ json: scene })
  }

  /** Debounce, then apply the edited JSON through the command seam. */
  function scheduleApply(content: Content) {
    if (applyTimer.current) clearTimeout(applyTimer.current)
    applyTimer.current = setTimeout(() => applyContent(content), 400)
  }

  function applyContent(content: Content) {
    let json: unknown
    try {
      json = "json" in content ? content.json : JSON.parse(content.text)
    } catch {
      setStatus("error")
      setErrorMsg("Invalid JSON")
      return
    }
    if (typeof json !== "object" || json === null || Array.isArray(json)) {
      setStatus("error")
      setErrorMsg("The scene must be a JSON object")
      return
    }
    // Skip no-op applies (whitespace-only / semantically identical) so idle
    // reformatting doesn't churn history or clear the selection.
    if (stableEqual(json, ctrl.store.state.document.scene)) {
      setStatus("synced")
      return
    }
    const result = ctrl.dispatch(
      { command: "scene.apply", args: json as Record<string, unknown> },
      { label: "Edit scene (code)", source: "user" }
    )
    if (!result.ok) {
      setStatus("error")
      setErrorMsg(result.errors[0] ?? "Could not apply scene")
      return
    }
    // The dispatch produced a fresh scene identity; adopt it as ours so the
    // subscription treats the resulting store bump as an echo, not an update.
    pushedRef.current = ctrl.store.state.document.scene
    setStatus(result.warnings.length ? "editing" : "synced")
    setErrorMsg(result.warnings.length ? result.warnings[0] : null)
  }

  return (
    <div className="jse-theme-dark flex min-h-0 flex-1 flex-col">
      <div className="flex h-6 shrink-0 items-center gap-2 px-2 text-[10px]">
        <StatusDot status={status} />
        <span className="truncate text-muted-foreground">
          {errorMsg ??
            (status === "synced"
              ? "In sync with the canvas"
              : status === "editing"
                ? "Applying edits…"
                : "")}
        </span>
        <button
          type="button"
          className="ml-auto shrink-0 rounded-sm px-1.5 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Discard local edits and reload the scene from the canvas"
          onClick={() => {
            pushScene(ctrl.store.state.document.scene)
            setStatus("synced")
            setErrorMsg(null)
          }}
        >
          Reset from canvas
        </button>
      </div>
      {/* vanilla-jsoneditor mounts here; it manages its own DOM + CSS */}
      <div
        ref={hostRef}
        className="min-h-0 flex-1 overflow-hidden text-[13px]"
      />
    </div>
  )
}

function StatusDot({ status }: { status: SyncState }) {
  const color =
    status === "synced"
      ? "bg-emerald-500"
      : status === "editing"
        ? "bg-amber-500"
        : "bg-red-500"
  return <span className={`size-1.5 shrink-0 rounded-full ${color}`} />
}

// --- helpers -----------------------------------------------------------------

/** vanilla-jsoneditor error shapes → a short human string. */
function describeErrors(errors: unknown): string {
  const e = errors as {
    parseError?: { message?: string }
    validationErrors?: Array<{ message?: string; path?: unknown[] }>
  }
  if (e.parseError?.message) return e.parseError.message
  const first = e.validationErrors?.[0]
  if (first)
    return `${(first.path ?? []).join(".")}: ${first.message ?? "invalid"}`
  return "Invalid JSON"
}

/** Order-independent structural equality via sorted-key serialization. */
function stableEqual(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b)
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_k, v) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return Object.keys(v as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => {
          acc[k] = (v as Record<string, unknown>)[k]
          return acc
        }, {})
    }
    return v
  })
}
