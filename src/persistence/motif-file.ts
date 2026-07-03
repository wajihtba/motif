// .motif files — a zip of the project record plus every referenced asset
// blob, so a project moves between machines whole. Layout:
//
//   meta.json       { version, name, createdAt, updatedAt }
//   document.json   the Document (scene, brief, formats, brand kit)
//   chat.json       transcript + compacted API replay history
//   assets/<id>     raw blobs for every `asset:<id>` the document references
//
// Import mints a NEW project id (imports never clobber an existing project);
// asset ids are kept as-is — the document references them by id, and the
// global asset store treats a re-import of the same blob as a refresh.

import { strFromU8, strToU8, unzipSync, zipSync } from "fflate"
import type { Document } from "../scene/types"
import type { ProjectRecord, StoredChat } from "./projects"
import { getAssetBlob, putAsset } from "./assets"
import { newProjectRecord, putProject } from "./projects"

const VERSION = 1

/** Every `asset:<id>` reference anywhere in the document (node images, brand
 *  logo, css url() values) — found lexically over the JSON, which is exactly
 *  the set the sanitizer allows through. */
export function assetIdsIn(document: Document): string[] {
  const found = JSON.stringify(document).match(/asset:[\w.-]+/g) ?? []
  return [...new Set(found.map((u) => u.replace(/^asset:/, "")))]
}

export async function exportMotifFile(record: ProjectRecord): Promise<Blob> {
  const files: Record<string, Uint8Array> = {
    "meta.json": strToU8(
      JSON.stringify({
        version: VERSION,
        name: record.name,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      })
    ),
    "document.json": strToU8(JSON.stringify(record.document)),
    "chat.json": strToU8(JSON.stringify(record.chat)),
  }
  for (const id of assetIdsIn(record.document)) {
    const blob = await getAssetBlob(`asset:${id}`)
    if (blob) {
      files[`assets/${id}`] = new Uint8Array(await blob.arrayBuffer())
    }
  }
  return new Blob([zipSync(files)], { type: "application/zip" })
}

export async function importMotifFile(file: File): Promise<ProjectRecord> {
  const entries = unzipSync(new Uint8Array(await file.arrayBuffer()))
  if (!("document.json" in entries)) {
    throw new Error("not a .motif file (document.json missing)")
  }
  const document = JSON.parse(strFromU8(entries["document.json"])) as Document
  const chat =
    "chat.json" in entries
      ? (JSON.parse(strFromU8(entries["chat.json"])) as StoredChat)
      : { items: [], apiMessages: [] }

  for (const [path, bytes] of Object.entries(entries)) {
    if (!path.startsWith("assets/") || !bytes.length) continue
    const id = path.slice("assets/".length)
    await putAsset(new Blob([bytes]), id)
  }

  const record = newProjectRecord(undefined, document.name)
  record.document = document
  record.chat = chat
  await putProject(record)
  return record
}
