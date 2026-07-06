// Project records — the durable unit the home grid lists and the editor
// loads. One record = document + chat transcript + a thumbnail, keyed by the
// routing id. Documents are plain JSON (immer-frozen objects structured-clone
// fine into IndexedDB).

import type { ApiMessage, ChatItem } from "../agent/chat"
import type { BrandKit, Document, FxTarget, Scene } from "../scene/types"
import { snapshotFromKit } from "../brand/compile"
import { emptyDocument, flatten } from "../scene/model"
import { db, PROJECT_STORE as STORE } from "./db"

export interface StoredChat {
  items: ChatItem[]
  apiMessages: ApiMessage[]
}

export interface ProjectRecord {
  id: string
  name: string
  document: Document
  chat: StoredChat
  /** Small JPEG data URL captured from the live canvas (home-grid card). */
  thumb?: string
  createdAt: number
  updatedAt: number
}

export function newProjectRecord(
  id?: string,
  name = "Untitled"
): ProjectRecord {
  const document = emptyDocument(name)
  const now = Date.now()
  return {
    id: id ?? `p${now.toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    name,
    document,
    chat: { items: [], apiMessages: [] },
    createdAt: now,
    updatedAt: now,
  }
}

export async function listProjects(): Promise<ProjectRecord[]> {
  const all = (await (await db()).getAll(STORE)) as ProjectRecord[]
  return all.sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function getProject(id: string): Promise<ProjectRecord | null> {
  const record =
    ((await (await db()).get(STORE, id)) as ProjectRecord | undefined) ?? null
  if (record) migrateDocument(record.document)
  return record
}

/** In-place migrations for records saved by older builds.
 *  - legacy `{type:"role"}` FxTargets resolve to element ids (or drop);
 *  - the old `brandKit` lifts into the BrandSnapshot shape (stays ad-hoc —
 *    no library record is minted; the user links a brand explicitly). */
export function migrateDocument(doc: Document): void {
  const legacy = doc as Document & { brandKit?: BrandKit }
  if (legacy.brandKit && !doc.brand) {
    doc.brand = snapshotFromKit(legacy.brandKit)
    delete legacy.brandKit
  }
  const scene = doc.scene
  const fix = (target: unknown): FxTarget | null => {
    const t = target as { type?: string; role?: string } | undefined
    if (!t || t.type !== "role") return (target as FxTarget) ?? null
    const ids = flatten(scene.root)
      .filter((n) => n.role === t.role)
      .map((n) => n.id)
    return ids.length ? { type: "elements", ids } : null
  }
  migrateTargets(scene, fix)
}

function migrateTargets(
  scene: Scene,
  fix: (t: unknown) => FxTarget | null
): void {
  scene.effects = scene.effects.filter((l) => {
    const t = fix(l.target)
    if (!t) return false
    l.target = t
    return true
  })
  scene.animations = scene.animations.filter((tr) => {
    const t = fix(tr.target)
    if (!t) return false
    tr.target = t
    return true
  })
}

export async function putProject(record: ProjectRecord): Promise<void> {
  await (await db()).put(STORE, record)
}

export async function deleteProject(id: string): Promise<void> {
  await (await db()).delete(STORE, id)
}

/** Editor-route entry: open an existing record, or mint one under the routed
 *  id so deep links and the scratch route both just work. */
export async function loadOrCreateProject(id: string): Promise<ProjectRecord> {
  const existing = await getProject(id)
  if (existing) return existing
  const record = newProjectRecord(id)
  await putProject(record)
  return record
}
