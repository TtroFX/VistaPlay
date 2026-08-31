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
  it('allocates paused playback from its actual playing intervals', () => {
    const result = calculateStatistics([session({
      startedAt: '2026-08-29T10:00:00',
      endedAt: '2026-08-29T12:30:10',
      realElapsedSeconds: 20,
      watchedMediaSeconds: 20,
      playbackRates: [{ rate: 1, realSeconds: 20 }],
      playingIntervals: [
        { startedAt: '2026-08-29T10:00:00', endedAt: '2026-08-29T10:00:10', realSeconds: 10 },
        { startedAt: '2026-08-29T12:30:00', endedAt: '2026-08-29T12:30:10', realSeconds: 10 }
      ]
    })])
    expect(result.heatmap).toEqual({ '10:00': 10, '12:30': 10 })
  })
  it('allows negative time saved at slower-than-real media progress', () => {
    expect(calculateStatistics([session({ watchedMediaSeconds: 20, realElapsedSeconds: 40, playbackRates: [{ rate: .5, realSeconds: 40 }] })]).timeSavedSeconds).toBe(-20)
  })
  it('counts accumulated playback for the same video once', () => {
    const sessions = [session({ realElapsedSeconds: 6, watchedMediaSeconds: 6, playbackRates: [{ rate: 1, realSeconds: 6 }] }), session({ realElapsedSeconds: 6, watchedMediaSeconds: 6, playbackRates: [{ rate: 1, realSeconds: 6 }] })]
    expect(calculateStatistics(sessions, { 'video-a': 100 }).watchedVideoCount).toBe(1)
  })
  it('aggregates category playing time from verified video metadata', () => {
    const sessions = [session({ realElapsedSeconds: 20 }), session({ videoId: 'video-b', realElapsedSeconds: 15 }), session({ videoId: 'unknown', realElapsedSeconds: 9 })]
    const result = calculateStatistics(sessions, {}, { 'video-a': '27', 'video-b': '27' })
    expect(result.categorySeconds).toEqual({ '27': 35 })
  })
})
