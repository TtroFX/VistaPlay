import type { WatchSession } from '../domain/types'
import { countsAsWatched } from './playerMath'

export interface StatisticsSummary {
  realWatchSeconds: number
  watchedVideoCount: number
  averagePlaybackRate: number
  timeSavedSeconds: number
  channelSeconds: Record<string, number>
  heatmap: Record<string, number>
}

export function calculateStatistics(sessions: WatchSession[], durations: Record<string, number> = {}): StatisticsSummary {
  let realWatchSeconds = 0
  let weightedRate = 0
  let timeSavedSeconds = 0
  const watched = new Set<string>()
  const channelSeconds: Record<string, number> = {}
  const heatmap: Record<string, number> = {}
  for (const session of sessions) {
    realWatchSeconds += session.realElapsedSeconds
    weightedRate += session.playbackRates.reduce((sum, entry) => sum + entry.rate * entry.realSeconds, 0)
    timeSavedSeconds += session.watchedMediaSeconds - session.realElapsedSeconds
    const duration = durations[session.videoId] ?? (session.completionRate > 0 ? session.watchedMediaSeconds / session.completionRate : Infinity)
    if (countsAsWatched(session.realElapsedSeconds, duration)) watched.add(session.videoId)
    if (session.channelId) channelSeconds[session.channelId] = (channelSeconds[session.channelId] ?? 0) + session.realElapsedSeconds
    let cursor = new Date(session.startedAt)
    let remaining = session.realElapsedSeconds
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
  return {
    realWatchSeconds, watchedVideoCount: watched.size,
    averagePlaybackRate: realWatchSeconds ? weightedRate / realWatchSeconds : 0,
    timeSavedSeconds, channelSeconds, heatmap
  }
}
