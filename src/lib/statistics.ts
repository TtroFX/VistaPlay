import type { WatchSession } from '../domain/types'
import { countsAsWatched } from './playerMath'

export interface StatisticsSummary {
  realWatchSeconds: number
  watchedVideoCount: number
  averagePlaybackRate: number
  timeSavedSeconds: number
  channelSeconds: Record<string, number>
  categorySeconds: Record<string, number>
  heatmap: Record<string, number>
}

function allocateHeatmap(heatmap: Record<string, number>, startedAt: string, realSeconds: number): void {
  let cursor = new Date(startedAt)
  let remaining = realSeconds
  while (remaining > 0) {
    const minutes = cursor.getHours() * 60 + cursor.getMinutes()
    const bucketStartMinutes = Math.floor(minutes / 30) * 30
    const bucket = `${String(Math.floor(bucketStartMinutes / 60)).padStart(2, '0')}:${bucketStartMinutes % 60 ? '30' : '00'}`
    const nextBoundary = new Date(cursor)
    nextBoundary.setSeconds(0, 0)
    nextBoundary.setMinutes(bucketStartMinutes % 60 + 30)
    const available = Math.max(0.001, (nextBoundary.getTime() - cursor.getTime()) / 1000)
    const allocation = Math.min(remaining, available)
    heatmap[bucket] = (heatmap[bucket] ?? 0) + allocation
    remaining -= allocation
    cursor = new Date(cursor.getTime() + allocation * 1000)
  }
}

export function calculateStatistics(sessions: WatchSession[], durations: Record<string, number> = {}, categories: Record<string, string> = {}): StatisticsSummary {
  let realWatchSeconds = 0
  let weightedRate = 0
  let timeSavedSeconds = 0
  const videoSeconds: Record<string, number> = {}
  const inferredDurations: Record<string, number> = {}
  const channelSeconds: Record<string, number> = {}
  const categorySeconds: Record<string, number> = {}
  const heatmap: Record<string, number> = {}
  for (const session of sessions) {
    realWatchSeconds += session.realElapsedSeconds
    weightedRate += session.playbackRates.reduce((sum, entry) => sum + entry.rate * entry.realSeconds, 0)
    timeSavedSeconds += session.watchedMediaSeconds - session.realElapsedSeconds
    videoSeconds[session.videoId] = (videoSeconds[session.videoId] ?? 0) + session.realElapsedSeconds
    if (session.completionRate > 0) inferredDurations[session.videoId] = Math.max(inferredDurations[session.videoId] ?? 0, session.watchedMediaSeconds / session.completionRate)
    if (session.channelId) channelSeconds[session.channelId] = (channelSeconds[session.channelId] ?? 0) + session.realElapsedSeconds
    const categoryId = categories[session.videoId]
    if (categoryId) categorySeconds[categoryId] = (categorySeconds[categoryId] ?? 0) + session.realElapsedSeconds
    const intervals = session.playingIntervals?.length
      ? session.playingIntervals
      : [{ startedAt: session.startedAt, endedAt: session.endedAt, realSeconds: session.realElapsedSeconds }]
    for (const interval of intervals) allocateHeatmap(heatmap, interval.startedAt, interval.realSeconds)
  }
  const watchedVideoCount = Object.entries(videoSeconds).filter(([videoId, seconds]) => countsAsWatched(seconds, durations[videoId] ?? inferredDurations[videoId] ?? Infinity)).length
  return {
    realWatchSeconds, watchedVideoCount,
    averagePlaybackRate: realWatchSeconds ? weightedRate / realWatchSeconds : 0,
    timeSavedSeconds, channelSeconds, categorySeconds, heatmap
  }
}
