import { describe, expect, it } from 'vitest'
import type { WatchSession } from '../domain/types'
import { calculateStatistics } from './statistics'

const session = (patch: Partial<WatchSession>): WatchSession => ({ sessionId: crypto.randomUUID(), videoId: 'video-a', channelId: 'channel-a', startedAt: '2026-08-29T10:29:50', endedAt: '2026-08-29T10:31:30', watchedMediaSeconds: 120, realElapsedSeconds: 60, playbackRates: [{ rate: 2, realSeconds: 60 }], seekEvents: [], completionRate: .5, ...patch })

describe('statistics aggregation', () => {
  it('weights playback rate by actual playing seconds and deduplicates video count', () => {
    const result = calculateStatistics([session({}), session({ startedAt: '2026-08-29T12:00:00', watchedMediaSeconds: 40, realElapsedSeconds: 40, playbackRates: [{ rate: 1, realSeconds: 40 }] })], { 'video-a': 240 })
    expect(result.realWatchSeconds).toBe(100)
    expect(result.averagePlaybackRate).toBeCloseTo(1.6)
    expect(result.timeSavedSeconds).toBe(60)
    expect(result.watchedVideoCount).toBe(1)
  })
  it('distributes continuous playing seconds across 30-minute local buckets', () => {
    const result = calculateStatistics([session({ realElapsedSeconds: 20, watchedMediaSeconds: 20, playbackRates: [{ rate: 1, realSeconds: 20 }] })])
    expect(result.heatmap['10:00']).toBeCloseTo(10)
    expect(result.heatmap['10:30']).toBeCloseTo(10)
  })
  it('allows negative time saved at slower-than-real media progress', () => {
    expect(calculateStatistics([session({ watchedMediaSeconds: 20, realElapsedSeconds: 40, playbackRates: [{ rate: .5, realSeconds: 40 }] })]).timeSavedSeconds).toBe(-20)
  })
})
