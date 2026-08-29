import { describe, expect, it } from 'vitest'
import { countsAsWatched, isCompleted, resolvePlaybackRate } from './playerMath'

describe('player rules', () => {
  it('chooses the slower rate on an equal-distance tie', () => {
    expect(resolvePlaybackRate(1.375, [1, 1.25, 1.5, 2])).toBe(1.25)
  })
  it('uses completion and watched-time guardrails', () => {
    expect(isCompleted(91, 100, 24)).toBe(false)
    expect(isCompleted(91, 100, 25)).toBe(true)
  })
  it('counts a short video after the defined threshold', () => {
    expect(countsAsWatched(5, 20)).toBe(true)
    expect(countsAsWatched(4.9, 20)).toBe(false)
  })
})
