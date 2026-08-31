import { afterEach, describe, expect, it, vi } from 'vitest'
import { toggleFullscreen } from './fullscreen'

afterEach(() => {
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null })
  Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: undefined })
  vi.restoreAllMocks()
})

describe('toggleFullscreen', () => {
  it('reports unavailable when the element has no capability', async () => {
    await expect(toggleFullscreen(null)).resolves.toBe('unavailable')
  })

  it('enters fullscreen through the provided element', async () => {
    const element = document.createElement('div')
    const requestFullscreen = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(element, 'requestFullscreen', { configurable: true, value: requestFullscreen })

    await expect(toggleFullscreen(element)).resolves.toBe('entered')
    expect(requestFullscreen).toHaveBeenCalledOnce()
  })

  it('exits the active fullscreen document', async () => {
    const element = document.createElement('div')
    const exitFullscreen = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: element })
    Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: exitFullscreen })

    await expect(toggleFullscreen(element)).resolves.toBe('exited')
    expect(exitFullscreen).toHaveBeenCalledOnce()
  })
})
