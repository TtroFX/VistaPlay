import { useEffect, useRef, type RefObject } from 'react'

const INTERACTIVE = 'iframe, input, textarea, select, button, a, [contenteditable="true"], [role="slider"], .player-shell, .controls-row, .watch-pane, .modal, .queue-list'

export function useEdgeSwipeBack(onBack: () => void): RefObject<HTMLElement | null> {
  const ref = useRef<HTMLElement>(null)
  const offset = useRef(0)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    let startX = 0; let startY = 0; let startedAt = 0; let tracking = false
    const reset = () => { tracking = false; offset.current = 0; element.style.removeProperty('--swipe-offset'); element.classList.remove('edge-swiping') }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null
      if (event.pointerType !== 'touch' || event.clientX > 42 || target?.closest(INTERACTIVE)) return
      startX = event.clientX; startY = event.clientY; startedAt = performance.now(); tracking = true
    }
    const onPointerMove = (event: PointerEvent) => {
      if (!tracking) return
      const x = Math.max(0, event.clientX - startX); const y = Math.abs(event.clientY - startY)
      if (y > 50 && y > x) { reset(); return }
      offset.current = Math.min(110, x)
      element.style.setProperty('--swipe-offset', `${offset.current}px`); element.classList.add('edge-swiping')
    }
    const onPointerUp = () => {
      const shouldNavigate = tracking && offset.current >= 88 && performance.now() - startedAt < 800
      reset(); if (shouldNavigate) onBack()
    }
    element.addEventListener('pointerdown', onPointerDown); element.addEventListener('pointermove', onPointerMove); element.addEventListener('pointerup', onPointerUp); element.addEventListener('pointercancel', reset)
    return () => { element.removeEventListener('pointerdown', onPointerDown); element.removeEventListener('pointermove', onPointerMove); element.removeEventListener('pointerup', onPointerUp); element.removeEventListener('pointercancel', reset) }
  }, [onBack])
  return ref
}
