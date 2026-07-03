// ⌘K command palette — every editor action reachable from the keyboard.
// Items dispatch through the controller (the same seam as buttons and the
// agent), so anything here is undoable exactly like its pointer equivalent.

import { useNavigate } from "@tanstack/react-router"
import type { EditorController } from "@/controller"
import type { HtmlCanvasBackend } from "@/engine/html-canvas"
import type { TopBarViewport } from "./TopBar"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"
import { FORMATS } from "@/content/formats"
import { LOOKS } from "@/content/looks"
import { useEditorState } from "@/hooks/use-document-store"

export function CommandPalette({
  open,
  onOpenChange,
  ctrl,
  backend,
  viewport,
  openHelp,
  toggleBudget,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  ctrl: EditorController
  backend: HtmlCanvasBackend
  viewport: TopBarViewport | null
  openHelp: () => void
  toggleBudget?: () => void
}) {
  const state = useEditorState(ctrl)
  const selection = state.selection
  const run = (fn: () => void) => () => {
    onOpenChange(false)
    fn()
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Command palette"
      description="Search editor actions"
    >
      <Command>
        <CommandInput placeholder="Type a command…" />
        <CommandList>
          <CommandEmpty>No matching command.</CommandEmpty>

          <CommandGroup heading="Edit">
            <CommandItem
              disabled={!ctrl.history.canUndo}
              onSelect={run(() => ctrl.undo())}
            >
              Undo
              <CommandShortcut>⌘Z</CommandShortcut>
            </CommandItem>
            <CommandItem
              disabled={!ctrl.history.canRedo}
              onSelect={run(() => ctrl.redo())}
            >
              Redo
              <CommandShortcut>⌘⇧Z</CommandShortcut>
            </CommandItem>
            <CommandItem
              disabled={!selection.length}
              onSelect={run(() =>
                ctrl.dispatch(
                  selection.map((id) => ({
                    command: "element.duplicate",
                    args: { id },
                  })),
                  { label: "Duplicate" }
                )
              )}
            >
              Duplicate selection
              <CommandShortcut>⌘D</CommandShortcut>
            </CommandItem>
            <CommandItem
              disabled={!selection.length}
              onSelect={run(() =>
                ctrl.dispatch({
                  command: "element.delete",
                  args: { ids: selection },
                })
              )}
            >
              Delete selection
              <CommandShortcut>⌫</CommandShortcut>
            </CommandItem>
          </CommandGroup>

          <CommandSeparator />
          <CommandGroup heading="View">
            <CommandItem onSelect={run(() => viewport?.fit())}>
              Zoom to fit
            </CommandItem>
            <CommandItem onSelect={run(() => viewport?.reset())}>
              Zoom to 100%
            </CommandItem>
            <CommandItem
              onSelect={run(() =>
                backend.isPlaying ? backend.pause() : backend.play()
              )}
            >
              Play / pause timeline
              <CommandShortcut>Space</CommandShortcut>
            </CommandItem>
            {toggleBudget && (
              <CommandItem
                value="performance overlay fps budget"
                onSelect={run(toggleBudget)}
              >
                Toggle performance overlay
              </CommandItem>
            )}
          </CommandGroup>

          <CommandSeparator />
          <CommandGroup heading="Looks">
            {LOOKS.map((l) => (
              <CommandItem
                key={l.name}
                value={`look ${l.name} ${l.label}`}
                onSelect={run(() =>
                  ctrl.dispatch({
                    command: "look.apply",
                    args: { name: l.name },
                  })
                )}
              >
                Look: {l.label}
              </CommandItem>
            ))}
            <CommandItem
              value="look none remove clear"
              onSelect={run(() =>
                ctrl.dispatch({ command: "look.apply", args: { name: "none" } })
              )}
            >
              Look: remove
            </CommandItem>
          </CommandGroup>

          <CommandSeparator />
          <CommandGroup heading="Format">
            {FORMATS.map((f) => (
              <CommandItem
                key={f.key}
                value={`format ${f.key} ${f.label}`}
                onSelect={run(() =>
                  ctrl.dispatch({
                    command: "scene.setFormat",
                    args: { format: f.key, width: f.w, height: f.h },
                  })
                )}
              >
                Format: {f.label} · {f.w}×{f.h}
              </CommandItem>
            ))}
          </CommandGroup>

          <CommandSeparator />
          <CommandGroup heading="Go">
            <CommandItem onSelect={run(openHelp)}>
              Keyboard shortcuts
              <CommandShortcut>⌘/</CommandShortcut>
            </CommandItem>
            <HomeItem onDone={() => onOpenChange(false)} />
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  )
}

function HomeItem({ onDone }: { onDone: () => void }) {
  const navigate = useNavigate()
  return (
    <CommandItem
      onSelect={() => {
        onDone()
        void navigate({ to: "/" })
      }}
    >
      Back to projects
    </CommandItem>
  )
}
