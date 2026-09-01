import { describe, expect, it } from 'vitest'
import { nextSupportedRate, resolveSupportedRate, VISTAPLAY_STANDARD_RATES } from './playbackRates'

describe('playback rate policy', () => {
  it('owns the VistaPlay standard rate ladder through 8x', () => {
    expect(VISTAPLAY_STANDARD_RATES).toEqual([0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 6, 8])
  })

  it('chooses the slower supported rate on an equal-distance tie', () => {
    expect(resolveSupportedRate(1.375, [1, 1.25, 1.5, 2])).toBe(1.25)
  })

  it('keeps desired rate resolution separate from the standard ladder', () => {
    expect(resolveSupportedRate(4, [0.5, 1, 1.5, 2])).toBe(2)
    expect(resolveSupportedRate(4, VISTAPLAY_STANDARD_RATES)).toBe(4)
  })

  it('resolves temporary boost from actual supported rates', () => {
    expect(nextSupportedRate(1.5, [1, 1.5, 2], 'next')).toBe(2)
    expect(nextSupportedRate(1.5, [1, 1.5, 2, 4, 8], 'maximum')).toBe(8)
  })
})
