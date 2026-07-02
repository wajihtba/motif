// The chat rail — the PRIMARY panel of an agent-first editor
// (docs/plan/00-product.md). User bubbles on the right; agent narration as
// plain text (it's one-sentence action narration, not prose); tool calls as
// inline chips with live labels and an "Applied · Undo" affordance; a brief
// card pinned above the composer; sample brief chips in the empty state.

import { useMemo, useState, useSyncExternalStore } from "react"
import type { ChatStore } from "@/agent/chat"
import type { AgentSession } from "@/agent/loop"
import type { EditorController } from "@/controller"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller"
import { Spinner } from "@/components/ui/spinner"
import { BriefCard } from "./BriefCard"
import { PromptInput } from "./PromptInput"
import { ToolCallChip } from "./ToolCallChip"

const SAMPLE_BRIEFS = [
  "Spring sale — 30% off outdoor gear, energetic but premium",
  "Launch teaser for a matte-black espresso machine",
  "Event promo: rooftop yoga, Saturday 9am, calm + airy",
  "Minimal quote post for a design studio",
]

export function ChatRail({
  ctrl,
  chat,
  session,
}: {
  ctrl: EditorController
  chat: ChatStore
  session: AgentSession
}) {
  const snapshot = useSyncExternalStore(
    (cb) => chat.subscribe(cb),
    () => chat.getSnapshot(),
    () => chat.getSnapshot()
  )
  const [draft, setDraft] = useState("")
  const running = snapshot.status === "running"

  const send = (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || running) return
    setDraft("")
    void session.send(trimmed)
  }

  const empty = snapshot.items.length === 0

  return (
    <aside className="flex w-90 shrink-0 flex-col border-r bg-background">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b px-3">
        <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Chat
        </span>
        {running && <Spinner className="size-3.5 text-primary" />}
      </div>

      {empty ? (
        <EmptyState onPick={send} />
      ) : (
        <MessageScrollerProvider>
          <MessageScroller className="min-h-0 flex-1">
            <MessageScrollerViewport>
              <MessageScrollerContent className="space-y-3 p-3">
                {snapshot.items.map((item) =>
                  item.kind === "text" ? (
                    item.role === "user" ? (
                      <Bubble key={item.id} align="end">
                        <BubbleContent className="text-sm">
                          {item.text}
                        </BubbleContent>
                      </Bubble>
                    ) : (
                      <p
                        key={item.id}
                        className="text-sm leading-relaxed text-foreground/85"
                      >
                        {item.text}
                        {item.streaming && (
                          <span className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse bg-primary align-middle" />
                        )}
                      </p>
                    )
                  ) : (
                    <ToolCallChip
                      key={item.id}
                      item={item}
                      ctrl={ctrl}
                      chat={chat}
                    />
                  )
                )}
                {snapshot.error && (
                  <Alert variant="destructive">
                    <AlertDescription className="text-xs">
                      {snapshot.error}
                    </AlertDescription>
                  </Alert>
                )}
              </MessageScrollerContent>
            </MessageScrollerViewport>
            <MessageScrollerButton />
          </MessageScroller>
        </MessageScrollerProvider>
      )}

      <div className="shrink-0 space-y-2 border-t p-3">
        <BriefCard ctrl={ctrl} />
        <PromptInput
          value={draft}
          onChange={setDraft}
          onSend={() => send(draft)}
          onStop={() => session.abort()}
          running={running}
        />
      </div>
    </aside>
  )
}

function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  const briefs = useMemo(() => SAMPLE_BRIEFS, [])
  return (
    <div className="flex min-h-0 flex-1 flex-col justify-center gap-4 p-5">
      <div>
        <p className="text-sm font-semibold">Chat a campaign into existence</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Describe what you need — audience, vibe, offer — and watch the canvas
          build itself. Everything stays editable by hand.
        </p>
      </div>
      <div className="flex flex-col items-start gap-2">
        {briefs.map((b) => (
          <Badge
            key={b}
            asChild
            variant="outline"
            className="cursor-pointer py-1.5 font-normal text-muted-foreground hover:border-primary/60 hover:text-foreground"
          >
            <button onClick={() => onPick(b)}>{b}</button>
          </Badge>
        ))}
      </div>
    </div>
  )
}
