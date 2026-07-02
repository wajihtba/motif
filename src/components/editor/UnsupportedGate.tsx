// Shown in place of the editor when HTML-in-Canvas is unavailable. Motif has
// no DOM fallback — everything paints into <canvas> — so the gate walks the
// user through enabling the experimental flag. The home route never gates;
// only surfaces that need the live canvas render this.

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

const FLAG_URL = "chrome://flags/#canvas-draw-element"

export function UnsupportedGate({ onRecheck }: { onRecheck?: () => void }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(FLAG_URL)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard denied — the URL is visible to copy by hand */
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-6">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="text-base">
            Motif needs Chrome&apos;s HTML-in-Canvas flag
          </CardTitle>
          <CardDescription>
            Motif paints real HTML/CSS into a canvas via an experimental
            Chromium API (<code>drawElementImage</code>). It isn&apos;t enabled
            in this browser yet.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal space-y-3 pl-5 text-sm">
            <li>
              Open this URL in a new tab (Chrome or Brave):
              <div className="mt-2 flex items-center gap-2">
                <code className="flex-1 truncate rounded-md border bg-muted px-2.5 py-1.5 font-mono text-xs">
                  {FLAG_URL}
                </code>
                <Button variant="outline" size="sm" onClick={copy}>
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            </li>
            <li>
              Set <span className="font-medium">Canvas Draw Element</span> to{" "}
              <span className="font-medium">Enabled</span>.
            </li>
            <li>Relaunch the browser and come back.</li>
          </ol>
        </CardContent>
        <CardFooter className="justify-between">
          <p className="text-xs text-muted-foreground">
            A no-flag preview mode is planned.
          </p>
          <Button onClick={onRecheck ?? (() => window.location.reload())}>
            Recheck
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
