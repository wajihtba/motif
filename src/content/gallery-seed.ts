// Gallery seeding — populate the home grid with the curated example projects
// (gallery.ts) on first visit, so a new user lands on a full board of finished,
// openable work instead of an empty state.
//
// Idempotent and deletion-respecting: a localStorage ledger records which
// example ids have ever been seeded. Each visit seeds only ids missing from the
// ledger, so (a) deleting an example never resurrects it and (b) shipping new
// gallery entries later seeds just the new ones. User-created projects are never
// touched.

import type { ProjectRecord } from "../persistence/projects"
import { getProject, putProject } from "../persistence/projects"
import { GALLERY, buildGalleryDocument } from "./gallery"

const LEDGER_KEY = "motif:gallery-seeded"

function readLedger(): Set<string> {
  try {
    const raw = localStorage.getItem(LEDGER_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw) as unknown
    return new Set(Array.isArray(arr) ? (arr as string[]) : [])
  } catch {
    return new Set()
  }
}

function writeLedger(ids: Set<string>): void {
  try {
    localStorage.setItem(LEDGER_KEY, JSON.stringify([...ids]))
  } catch {
    // Private-mode / quota — seeding is best-effort; skip silently.
  }
}

/** Seed any not-yet-seeded gallery examples into the project store. Safe to call
 *  on every home mount. Returns the number of examples inserted this run. */
export async function seedGallery(): Promise<number> {
  const ledger = readLedger()
  const pending = GALLERY.filter((ex) => !ledger.has(ex.id))
  if (pending.length === 0) return 0

  // Curated ordering: earlier entries should read as more recent so the grid
  // opens on entry 1. Space timestamps by a minute, all safely in the past.
  const base = Date.now() - 60_000
  let inserted = 0

  for (const ex of pending) {
    try {
      // Never clobber a project a user already owns at this id.
      if (await getProject(ex.id)) {
        ledger.add(ex.id)
        continue
      }
      const ts = base - GALLERY.indexOf(ex) * 60_000
      const record: ProjectRecord = {
        id: ex.id,
        name: ex.name,
        document: buildGalleryDocument(ex),
        chat: { items: [], apiMessages: [] },
        createdAt: ts,
        updatedAt: ts,
      }
      await putProject(record)
      ledger.add(ex.id)
      inserted++
    } catch {
      // Leave unseeded ids out of the ledger so a later visit retries them.
    }
  }

  writeLedger(ledger)
  return inserted
}
