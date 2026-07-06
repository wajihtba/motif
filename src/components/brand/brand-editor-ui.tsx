// Shared UI state for the /brand editor: which token the user is inspecting
// (hover/focus on a rail control → gallery highlights the tiles that consume
// it) and a short-lived "ping" fired on commit so the affected tiles flash
// once. Pure presentation state — never persisted, never touches the Brand.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"

/** Long enough to skip tokens swept over on the way to another control,
 *  short enough to feel immediate on the one you settle on. */
const FOCUS_DELAY_MS = 100
const PING_MS = 700

export interface TokenPing {
  key: string
  /** Bumps on every commit so repeat pings on the same token re-fire. */
  n: number
}

interface BrandEditorUiValue {
  focusedToken: string | null
  ping: TokenPing | null
  /** Hover/focus intent from a rail control; null on leave. */
  focusToken: (key: string | null) => void
  /** Fired when a token value commits — flashes the affected tiles. */
  pingToken: (key: string) => void
}

const Ctx = createContext<BrandEditorUiValue | null>(null)

export function BrandEditorUiProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [focusedToken, setFocusedToken] = useState<string | null>(null)
  const [ping, setPing] = useState<TokenPing | null>(null)
  const focusTimer = useRef<number | null>(null)
  const pingTimer = useRef<number | null>(null)
  const pingCount = useRef(0)

  const focusToken = useCallback((key: string | null) => {
    if (focusTimer.current !== null) {
      window.clearTimeout(focusTimer.current)
      focusTimer.current = null
    }
    if (key === null) {
      setFocusedToken(null)
      return
    }
    focusTimer.current = window.setTimeout(() => {
      focusTimer.current = null
      setFocusedToken(key)
    }, FOCUS_DELAY_MS)
  }, [])

  const pingToken = useCallback((key: string) => {
    if (pingTimer.current !== null) window.clearTimeout(pingTimer.current)
    setPing({ key, n: ++pingCount.current })
    pingTimer.current = window.setTimeout(() => {
      pingTimer.current = null
      setPing(null)
    }, PING_MS)
  }, [])

  useEffect(
    () => () => {
      if (focusTimer.current !== null) window.clearTimeout(focusTimer.current)
      if (pingTimer.current !== null) window.clearTimeout(pingTimer.current)
    },
    []
  )

  const value = useMemo(
    () => ({ focusedToken, ping, focusToken, pingToken }),
    [focusedToken, ping, focusToken, pingToken]
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

/** No-op fallback so brand components render outside the editor (dev pages). */
const NOOP: BrandEditorUiValue = {
  focusedToken: null,
  ping: null,
  focusToken: () => {},
  pingToken: () => {},
}

export function useBrandEditorUi(): BrandEditorUiValue {
  return useContext(Ctx) ?? NOOP
}

/** Highlight state for a gallery card that consumes `tokensUsed`: while a
 *  token is focused, affected cards highlight and the rest dim; `pingN` is a
 *  non-null remount key while a just-committed token affects this card. */
export function useTokenHighlight(tokensUsed: readonly string[]): {
  highlighted: boolean
  dimmed: boolean
  pingN: number | null
} {
  const { focusedToken, ping } = useBrandEditorUi()
  const affected = focusedToken !== null && tokensUsed.includes(focusedToken)
  return {
    highlighted: affected,
    dimmed: focusedToken !== null && !affected,
    pingN: ping && tokensUsed.includes(ping.key) ? ping.n : null,
  }
}
