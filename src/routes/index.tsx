// Home. Until persistence lands (M7: project grid, create/import), the home
// route drops straight into a scratch editor session.

import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({
      to: "/editor/$projectId",
      params: { projectId: "scratch" },
    })
  },
})
