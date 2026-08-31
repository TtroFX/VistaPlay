export type DiagnosticCategory = 'api' | 'player' | 'sync' | 'migration' | 'runtime'

export interface DiagnosticEvent { id: string; category: DiagnosticCategory; message: string; at: string }

export const APP_VERSION = '1.0.0'
const events: DiagnosticEvent[] = []
const target = new EventTarget()

export function recordDiagnostic(category: DiagnosticCategory, message: string): void {
  events.unshift({ id: crypto.randomUUID(), category, message: message.slice(0, 180), at: new Date().toISOString() })
  if (events.length > 30) events.length = 30
  target.dispatchEvent(new Event('change'))
}

export function getDiagnostics(): DiagnosticEvent[] { return [...events] }

export function subscribeDiagnostics(listener: () => void): () => void {
  target.addEventListener('change', listener)
  return () => target.removeEventListener('change', listener)
}

let installed = false
export function installRuntimeDiagnostics(): void {
  if (installed || typeof window === 'undefined') return
  installed = true
  window.addEventListener('error', () => recordDiagnostic('runtime', 'Unhandled window error'))
  window.addEventListener('unhandledrejection', () => recordDiagnostic('runtime', 'Unhandled promise rejection'))
}
