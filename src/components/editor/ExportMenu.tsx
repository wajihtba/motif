// Export menu + video progress dialog. Image exports run on the dedicated
// dpr=1 session (exact format pixels, effects settled); video steps frames
// deterministically through WebCodecs with cancel and a container-fallback
// notice (WebM when H.264 encode is unavailable).

import { useRef, useState } from "react"
import type { EditorController } from "@/controller"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Progress } from "@/components/ui/progress"
import { exportImage, exportVideo } from "@/engine/export"
import { useEditorState } from "@/hooks/use-document-store"

export function ExportMenu({ ctrl }: { ctrl: EditorController }) {
  const state = useEditorState(ctrl)
  const [busy, setBusy] = useState(false)
  const [video, setVideo] = useState<{
    progress: number
    total: number
    error?: string
    note?: string
  } | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const name = state.document.name || "motif"
  const scene = () => ctrl.store.state.document.scene

  const image = async (type: "png" | "jpeg") => {
    if (busy) return
    setBusy(true)
    try {
      const blob = await exportImage(scene(), type)
      download(blob, `${name}.${type === "jpeg" ? "jpg" : "png"}`)
    } catch (e) {
      alertError(e)
    } finally {
      setBusy(false)
    }
  }

  const startVideo = async () => {
    if (busy) return
    setBusy(true)
    const abort = new AbortController()
    abortRef.current = abort
    setVideo({ progress: 0, total: 1 })
    try {
      const result = await exportVideo(scene(), {
        signal: abort.signal,
        onProgress: (done, total) => setVideo({ progress: done, total }),
      })
      download(result.blob, `${name}.${result.container}`)
      setVideo(
        result.container === "webm"
          ? {
              progress: 1,
              total: 1,
              note: "Encoded as WebM — H.264 isn't available on this machine. Plays in browsers; convert for Instagram if needed.",
            }
          : null
      )
    } catch (e) {
      if ((e as DOMException).name !== "AbortError") {
        setVideo({
          progress: 0,
          total: 1,
          error: (e as Error).message || String(e),
        })
      } else {
        setVideo(null)
      }
    } finally {
      setBusy(false)
      abortRef.current = null
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" disabled={busy}>
            {busy ? "Exporting…" : "Export"}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => void image("png")}>
            PNG image
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void image("jpeg")}>
            JPEG image
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void startVideo()}>
            Video · {scene().timeline.duration}s mp4
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={video !== null}
        onOpenChange={(open) => {
          if (!open) {
            abortRef.current?.abort()
            setVideo(null)
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Exporting video</DialogTitle>
            <DialogDescription className="text-xs">
              {video?.error
                ? video.error
                : (video?.note ??
                  `Rendering ${scene().timeline.duration}s at 30fps — every frame is deterministic.`)}
            </DialogDescription>
          </DialogHeader>
          {!video?.error && !video?.note && (
            <Progress
              value={
                video ? (video.progress / Math.max(video.total, 1)) * 100 : 0
              }
            />
          )}
          <DialogFooter>
            {video?.note || video?.error ? (
              <Button size="sm" onClick={() => setVideo(null)}>
                Done
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => abortRef.current?.abort()}
              >
                Cancel
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

function alertError(e: unknown): void {
  console.error("[export]", e)
}
