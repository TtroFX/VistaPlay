import { useCallback, useEffect, useRef } from 'react'

export function useTemporaryHistory(open: boolean, onDismiss: () => void, name: string): (after?: () => void) => void {
  const id = useRef(`${name}:${crypto.randomUUID()}`)
  const dismissRef = useRef(onDismiss)
  const afterRef = useRef<(() => void) | undefined>(undefined)

  useEffect(() => { dismissRef.current = onDismiss }, [onDismiss])

  const dismiss = useCallback((after?: () => void) => {
    if (!open) { after?.(); return }
    if (history.state?.vistaplayTemporaryLayer === id.current) {
      afterRef.current = after
      history.back()
    } else {
      dismissRef.current()
      after?.()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onPopState = () => {
      dismissRef.current()
      const after = afterRef.current
      afterRef.current = undefined
      if (after) queueMicrotask(after)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      dismiss()
    }
    window.addEventListener('popstate', onPopState)
    window.addEventListener('keydown', onKeyDown)
    if (history.state?.vistaplayTemporaryLayer !== id.current) {
      history.pushState({ ...history.state, vistaplayTemporaryLayer: id.current }, '', location.href)
    }
    return () => {
      window.removeEventListener('popstate', onPopState)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [dismiss, open])

  return dismiss
}
