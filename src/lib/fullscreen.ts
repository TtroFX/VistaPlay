export type FullscreenResult = 'entered' | 'exited' | 'unavailable'

export async function toggleFullscreen(element?: HTMLElement | null): Promise<FullscreenResult> {
  if (document.fullscreenElement) {
    if (typeof document.exitFullscreen !== 'function') return 'unavailable'
    await document.exitFullscreen()
    return 'exited'
  }
  if (!element || typeof element.requestFullscreen !== 'function') return 'unavailable'
  await element.requestFullscreen()
  return 'entered'
}
