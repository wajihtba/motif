// Project records — the durable unit the home grid lists and the editor
// loads. One record = document + chat transcript + a thumbnail, keyed by the
// routing id. Documents are plain JSON (immer-frozen objects structured-clone
// fine into IndexedDB).

import type { ApiMessage, ChatItem } from "../agent/chat"
import type { Document } from "../scene/types"
import { emptyDocument } from "../scene/model"
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
  return (
    ((await (await db()).get(STORE, id)) as ProjectRecord | undefined) ?? null
  )
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
