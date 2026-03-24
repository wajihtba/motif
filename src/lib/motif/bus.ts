// ── M.bus — PluginBus ──
// Every significant action emits events. Future plugins subscribe here.

class PluginBus extends EventTarget {
  emit(name: string, detail?: unknown) {
    this.dispatchEvent(new CustomEvent(name, { detail }))
  }

  on(name: string, fn: (e: CustomEvent) => void) {
    this.addEventListener(name, fn as EventListener)
    return () => this.removeEventListener(name, fn as EventListener)
  }

  off(name: string, fn: (e: CustomEvent) => void) {
    this.removeEventListener(name, fn as EventListener)
  }
}

export const bus = new PluginBus()
