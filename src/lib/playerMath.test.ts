import { describe, expect, it } from 'vitest'
import { countsAsWatched, isCompleted, resolvePlaybackEndAction, shouldPersistProgress } from './playerMath'

describe('player rules', () => {
  it('uses completion and watched-time guardrails', () => {
    expect(isCompleted(91, 100, 24)).toBe(false)
    expect(isCompleted(91, 100, 25)).toBe(true)
  })
  it('counts a short video after the defined threshold', () => {
    expect(countsAsWatched(5, 20)).toBe(true)
    expect(countsAsWatched(4.9, 20)).toBe(false)
  })
  it('does not persist a new progress entry before ten playing seconds', () => {
    expect(shouldPersistProgress(false, 9.99)).toBe(false)
    expect(shouldPersistProgress(false, 10)).toBe(true)
    expect(shouldPersistProgress(true, 1)).toBe(true)
  })
  it('resolves end behavior in repeat, queue, stop priority order', () => {
    expect(resolvePlaybackEndAction(true, 2, true)).toBe('repeat')
    expect(resolvePlaybackEndAction(false, 2, true)).toBe('next')
    expect(resolvePlaybackEndAction(false, 2, false)).toBe('stop')
    expect(resolvePlaybackEndAction(false, 0, true)).toBe('stop')
  })
})
