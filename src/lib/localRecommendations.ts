import type { PersistedAppState, Recommendation, VideoRef } from '../domain/types'

export function rankLocalRecommendations(candidates: VideoRef[], state: PersistedAppState): Recommendation[] {
  const watchedChannels = Object.values(state.history).map((p) => state.videos[p.videoId]?.channelId).filter(Boolean)
  const affinity = new Map<string, number>()
  watchedChannels.forEach((id) => affinity.set(id!, (affinity.get(id!) ?? 0) + 1))
  const now = Date.now()
  const scored = candidates
    .filter((video) => !state.history[video.videoId] && video.available !== false)
    .map((video) => {
      const channelScore = Math.min(1, (affinity.get(video.channelId ?? '') ?? 0) / 5) * 25
      const ageDays = video.publishedAt ? Math.max(0, (now - Date.parse(video.publishedAt)) / 86400000) : 365
      const recency = Math.max(0, 1 - ageDays / 365) * 15
      const duration = video.durationSeconds ?? 600
      const durationScore = duration >= 180 && duration <= 1800 ? 10 : 4
      return { video, score: channelScore + recency + 10 + durationScore + 5, reason: channelScore > 10 ? 'よく見るChannelと関連' : '未視聴で新しい候補' }
    })
    .sort((a, b) => b.score - a.score)
  const perChannel = new Map<string, number>()
  const result: Recommendation[] = []
  for (const item of scored) {
    const channel = item.video.channelId ?? 'unknown'
    if ((perChannel.get(channel) ?? 0) >= 2 && result.length < 10) continue
    perChannel.set(channel, (perChannel.get(channel) ?? 0) + 1)
    result.push({ video: item.video, reason: item.reason, priority: result.length + 1, source: 'local' })
    if (result.length === 10) break
  }
  return result
}
