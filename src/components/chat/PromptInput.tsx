// The composer. Enter sends, Shift+Enter breaks; the send button flips to a
// Stop square while a turn runs (the loop is always abortable).

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

export function PromptInput({
  value,
  onChange,
  onSend,
  onStop,
  running,
}: {
  value: string
  onChange: (v: string) => void
  onSend: () => void
  onStop: () => void
  running: boolean
}) {
  return (
    <div className="flex items-end gap-2">
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            onSend()
          }
        }}
        placeholder="Describe the design or the change…"
        className="max-h-36 min-h-10 flex-1 resize-none text-sm"
        rows={1}
      />
      {running ? (
        <Button
          size="icon"
          variant="outline"
          onClick={onStop}
          title="Stop the agent"
        >
          <span className="size-2.5 bg-foreground" />
        </Button>
      ) : (
        <Button
          size="icon"
          onClick={onSend}
          disabled={!value.trim()}
          title="Send"
        >
          ↑
        </Button>
      )}
    </div>
  )
}
