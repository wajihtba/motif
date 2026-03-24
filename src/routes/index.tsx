import { createFileRoute } from "@tanstack/react-router"
import { Editor } from "~/components/editor/Editor"

export const Route = createFileRoute("/")({
  component: EditorPage,
})

function EditorPage() {
  return <Editor />
}
