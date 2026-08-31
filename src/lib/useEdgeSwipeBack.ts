import { useEffect, useRef, type RefObject } from 'react'

const INTERACTIVE = 'iframe, input, textarea, select, button, a, [contenteditable="true"], [role="slider"], .player-shell, .controls-row, .watch-pane, .modal, .queue-list'

export function useEdgeSwipeBack(onBack: () => void): RefObject<HTMLElement | null> {
  const ref = useRef<HTMLElement>(null)
  const offset = useRef(0)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    let startX = 0
    let startY = 0
    let startedAt = 0
    let pointerId: number | null = null

    const reset = () => {
      if (pointerId !== null && element.hasPointerCapture?.(pointerId)) {
        element.releasePointerCapture(pointerId)
      }
      pointerId = null
      offset.current = 0
      element.style.removeProperty('--swipe-offset')
      element.classList.remove('edge-swiping')
    }

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null
      if (event.pointerType !== 'touch' || event.clientX > 42 || target?.closest(INTERACTIVE)) return
      startX = event.clientX
      startY = event.clientY
      startedAt = performance.now()
      pointerId = event.pointerId
      element.setPointerCapture?.(event.pointerId)
    }

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return
      const x = Math.max(0, event.clientX - startX)
      const y = Math.abs(event.clientY - startY)
      if (y > 50 && y > x) { reset(); return }
      if (x < 8 || x <= y) return
      event.preventDefault()
      offset.current = Math.min(110, x)
      element.style.setProperty('--swipe-offset', `${offset.current}px`)
      element.classList.add('edge-swiping')
    }

    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return
      const shouldNavigate = offset.current >= 88 && performance.now() - startedAt < 800
      reset()
      if (shouldNavigate) onBack()
    }

    const onPointerCancel = (event: PointerEvent) => {
      if (event.pointerId === pointerId) reset()
    }

    element.addEventListener('pointerdown', onPointerDown)
    element.addEventListener('pointermove', onPointerMove)
    element.addEventListener('pointerup', onPointerUp)
    element.addEventListener('pointercancel', onPointerCancel)
    return () => {
      reset()
      element.removeEventListener('pointerdown', onPointerDown)
      element.removeEventListener('pointermove', onPointerMove)
      element.removeEventListener('pointerup', onPointerUp)
      element.removeEventListener('pointercancel', onPointerCancel)
    }
  }, [onBack])
  return ref
}
