import type { PersistedAppState, Recommendation, VideoRef } from '../domain/types'

interface ScoredCandidate {
  video: VideoRef
  baseScore: number
  topicScore: number
  channelScore: number
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function tokensFor(video: VideoRef, state: PersistedAppState): string[] {
  const localTags = state.tags.filter((tag) => tag.videoIds.includes(video.videoId)).map((tag) => tag.canonical)
  return [...new Set([video.categoryId, ...(video.tags ?? []), ...localTags].filter(Boolean).map((value) => value!.toLocaleLowerCase()))]
}

function median(values: number[]): number | undefined {
  if (!values.length) return undefined
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

export function rankLocalRecommendations(candidates: VideoRef[], state: PersistedAppState, now = Date.now()): Recommendation[] {
  const watched = Object.values(state.history)
    .filter((progress) => progress.state !== 'UNWATCHED')
    .map((progress) => state.videos[progress.videoId])
    .filter(Boolean)
  const channelAffinity = new Map<string, number>()
  const topicAffinity = new Map<string, number>()
  for (const video of watched) {
    if (video.channelId) channelAffinity.set(video.channelId, (channelAffinity.get(video.channelId) ?? 0) + 1)
    for (const token of tokensFor(video, state)) topicAffinity.set(token, (topicAffinity.get(token) ?? 0) + 1)
  }
  const maxChannelAffinity = Math.max(1, ...channelAffinity.values())
  const maxTopicAffinity = Math.max(1, ...topicAffinity.values())
  const preferredDuration = median(watched.map((video) => video.durationSeconds).filter((value): value is number => Boolean(value && value > 0)))

  const scored: ScoredCandidate[] = candidates
    .filter((video) => state.history[video.videoId]?.state === undefined || state.history[video.videoId]?.state === 'UNWATCHED')
    .filter((video) => video.available !== false)
    .map((video) => {
      const topics = tokensFor(video, state)
      const topicSimilarity = topics.length ? topics.reduce((sum, token) => sum + (topicAffinity.get(token) ?? 0) / maxTopicAffinity, 0) / topics.length : 0
      const topicScore = clamp01(topicSimilarity) * 35
      const channelScore = ((channelAffinity.get(video.channelId ?? '') ?? 0) / maxChannelAffinity) * 25
      const publishedAt = video.publishedAt ? Date.parse(video.publishedAt) : Number.NaN
      const ageDays = Number.isFinite(publishedAt) ? Math.max(0, (now - publishedAt) / 86400000) : 365
      const recencyScore = clamp01(1 - ageDays / 365) * 15
      const duration = video.durationSeconds
      const durationFit = duration && preferredDuration
        ? clamp01(1 - Math.abs(Math.log(duration / preferredDuration)) / Math.log(4))
        : duration && duration >= 180 && duration <= 1800 ? 0.8 : 0.4
      return { video, topicScore, channelScore, baseScore: topicScore + channelScore + recencyScore + 10 + durationFit * 10 }
    })

  const result: Recommendation[] = []
  const usedChannels = new Map<string, number>()
  const usedCategories = new Set<string>()
  while (result.length < 10) {
    const available = scored.filter((item) => !result.some((selected) => selected.video.videoId === item.video.videoId))
      .filter((item) => (usedChannels.get(item.video.channelId ?? 'unknown') ?? 0) < 2)
    if (!available.length) break
    available.sort((a, b) => {
      const diversityA = (usedChannels.has(a.video.channelId ?? 'unknown') ? 0 : 3) + (a.video.categoryId && !usedCategories.has(a.video.categoryId) ? 2 : 0)
      const diversityB = (usedChannels.has(b.video.channelId ?? 'unknown') ? 0 : 3) + (b.video.categoryId && !usedCategories.has(b.video.categoryId) ? 2 : 0)
      return (b.baseScore + diversityB) - (a.baseScore + diversityA)
    })
    const item = available[0]
    const reason = item.topicScore >= item.channelScore && item.topicScore > 0 ? 'Topic・Tagが視聴傾向に近い' : item.channelScore > 0 ? 'よく見るChannelと関連' : '未視聴で新しい候補'
    result.push({ video: item.video, reason, priority: result.length + 1, source: 'local' })
    const channel = item.video.channelId ?? 'unknown'
    usedChannels.set(channel, (usedChannels.get(channel) ?? 0) + 1)
    if (item.video.categoryId) usedCategories.add(item.video.categoryId)
  }
  return result
}
