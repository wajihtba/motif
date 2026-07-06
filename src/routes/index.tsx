// Project home — the card grid over the IndexedDB project store. Create,
// open, import (.motif), delete. Client-rendered data: IndexedDB only exists
// in the browser, so records load in an effect, not a route loader.

import { useEffect, useRef, useState } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import type { ProjectRecord } from "@/persistence/projects"
import { ScenePreview } from "@/components/ScenePreview"
import { Button } from "@/components/ui/button"
import { seedGallery } from "@/content/gallery-seed"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { importMotifFile } from "@/persistence/motif-file"
import {
  deleteProject,
  listProjects,
  newProjectRecord,
  putProject,
} from "@/persistence/projects"

export const Route = createFileRoute("/")({
  component: HomePage,
})

function HomePage() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState<ProjectRecord[] | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const importRef = useRef<HTMLInputElement>(null)

  const refresh = () => {
    void listProjects().then(setProjects)
  }
  // First-visit: seed the curated example gallery, then load the grid.
  useEffect(() => {
    void seedGallery().then(refresh)
  }, [])

  const open = (id: string) => {
    void navigate({ to: "/editor/$projectId", params: { projectId: id } })
  }

  const create = async (name: string) => {
    const record = newProjectRecord(undefined, name || "Untitled")
    await putProject(record)
    open(record.id)
  }

  const importFile = async (file: File) => {
    try {
      const record = await importMotifFile(file)
      open(record.id)
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="min-h-svh bg-background">
      <header className="mx-auto flex max-w-5xl items-center gap-3 px-6 pt-10 pb-6">
        <h1 className="text-lg font-bold tracking-wide">Motif</h1>
        <p className="text-sm text-muted-foreground">
          Chat a marketing visual into existence — real HTML, painted in canvas.
        </p>
        <div className="flex-1" />
        <Button
          variant="outline"
          size="sm"
          onClick={() => importRef.current?.click()}
        >
          Import .motif
        </Button>
        <input
          ref={importRef}
          type="file"
          accept=".motif,.zip"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void importFile(f)
            e.target.value = ""
          }}
        />
        <CreateDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          onCreate={(name) => void create(name)}
        />
      </header>

      <main className="mx-auto max-w-5xl px-6 pb-16">
        {projects === null ? null : projects.length === 0 ? (
          <EmptyHero onCreate={() => setCreateOpen(true)} />
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {projects.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                onOpen={() => open(p.id)}
                onDelete={() => {
                  void deleteProject(p.id).then(refresh)
                }}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

function EmptyHero({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed py-24 text-center">
      <div className="text-2xl font-semibold">Make your first visual</div>
      <p className="max-w-md text-sm text-muted-foreground">
        Describe a campaign to the agent — it designs a real, editable scene you
        can restyle, animate, and export for every platform.
      </p>
      <Button onClick={onCreate}>New project</Button>
    </div>
  )
}

function CreateDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onCreate: (name: string) => void
}) {
  const [name, setName] = useState("")
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">New project</Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm">New project</DialogTitle>
          <DialogDescription className="text-xs">
            The editor opens on the chat — describe what you need and watch it
            build.
          </DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          placeholder="Spring sale campaign"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onCreate(name.trim())
          }}
        />
        <DialogFooter>
          <Button size="sm" onClick={() => onCreate(name.trim())}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ProjectCard({
  project,
  onOpen,
  onDelete,
}: {
  project: ProjectRecord
  onOpen: () => void
  onDelete: () => void
}) {
  return (
    <div className="group overflow-hidden rounded-lg border bg-card transition-colors hover:border-primary/50">
      <button
        className="block w-full cursor-pointer text-left"
        onClick={onOpen}
      >
        <div className="canvas-well flex aspect-square items-center justify-center overflow-hidden">
          {project.thumb ? (
            <img
              src={project.thumb}
              alt=""
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <ScenePreview scene={project.document.scene} />
          )}
        </div>
      </button>
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm">{project.name}</div>
          <div className="text-[11px] text-muted-foreground">
            {timeAgo(project.updatedAt)}
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="opacity-0 group-hover:opacity-100"
            >
              ⋯
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onOpen}>Open</DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

function timeAgo(ts: number): string {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000))
  if (s < 60) return "just now"
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}
