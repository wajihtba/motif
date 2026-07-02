// Demand-driven rAF loop. Parks at 0% CPU when nothing needs painting; wakes
// on invalidate/domMutated/continuous. This is the ONLY place that knows the
// paint-record lifecycle rule: after any DOM mutation the compositor must wait
// one full rendering lifecycle before drawElementImage reflects it, encoded as
// `dirtyDom → skip-one-frame` (docs/plan/01-architecture.md §5).

export class FrameLoop {
  private raf = 0
  private running = false
  private needsPaint = false
  private settleFrames = 0
  private continuous = false
  private disposed = false
  private idleWaiters: Array<() => void> = []

  constructor(private render: (tSec: number) => void) {}

  /** Repaint with current content (paint records already valid). */
  invalidate(): void {
    this.needsPaint = true
    this.wake()
  }

  /** Repaint after a DOM mutation — waits one lifecycle for paint records. */
  domMutated(): void {
    this.settleFrames = Math.max(this.settleFrames, 1)
    this.needsPaint = true
    this.wake()
  }

  /** Motion preview: render every frame until turned off. */
  setContinuous(on: boolean): void {
    this.continuous = on
    if (on) this.wake()
  }

  get idle(): boolean {
    return !this.running
  }

  /** Continuous mode (animated content) — running forever by design. */
  get isContinuous(): boolean {
    return this.continuous
  }

  whenIdle(): Promise<void> {
    if (!this.running) return Promise.resolve()
    return new Promise((resolve) => this.idleWaiters.push(resolve))
  }

  private wake(): void {
    if (this.running || this.disposed) return
    this.running = true
    this.raf = requestAnimationFrame(this.tick)
  }

  private tick = (tMs: number): void => {
    if (this.disposed) return
    if (this.settleFrames > 0) {
      // A settle frame: the browser bakes fresh paint records this lifecycle;
      // drawing now would show the PREVIOUS DOM state.
      this.settleFrames -= 1
      this.raf = requestAnimationFrame(this.tick)
      return
    }
    if (this.needsPaint || this.continuous) {
      this.needsPaint = false
      this.render(tMs / 1000)
    }
    // render() may re-arm needsPaint/settleFrames (e.g. an image settled
    // mid-frame) — hasWork() re-reads them.
    if (this.hasWork()) {
      this.raf = requestAnimationFrame(this.tick)
    } else {
      this.running = false
      const waiters = this.idleWaiters
      this.idleWaiters = []
      for (const w of waiters) w()
    }
  }

  private hasWork(): boolean {
    return this.continuous || this.needsPaint || this.settleFrames > 0
  }

  dispose(): void {
    this.disposed = true
    cancelAnimationFrame(this.raf)
    this.running = false
    const waiters = this.idleWaiters
    this.idleWaiters = []
    for (const w of waiters) w()
  }
}
