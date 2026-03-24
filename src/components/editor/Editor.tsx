import { useEffect } from "react"
import { history } from "~/lib/motif"
import { Topbar } from "./Topbar"
import { ToolRail } from "./ToolRail"
import { SidePanel } from "./SidePanel"
import { Viewport } from "./Viewport"
import { PropsPanel } from "./PropsPanel"
import { ContextMenu } from "./ContextMenu"

export function Editor() {
  useEffect(() => {
    history.init()
  }, [])

  return (
    <div className="m-editor">
      <Topbar />
      <div className="m-editor-body">
        <ToolRail />
        <SidePanel />
        <Viewport />
        <PropsPanel />
      </div>
      <ContextMenu />
    </div>
  )
}
