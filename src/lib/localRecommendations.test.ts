import { describe, expect, it } from 'vitest'
import { createDefaultState } from '../config/features'
import type { VideoRef } from '../domain/types'
import { rankLocalRecommendations } from './localRecommendations'

const video = (videoId: string, channelId: string, categoryId: string, tags: string[] = []): VideoRef => ({
  videoId, channelId, categoryId, tags, title: videoId, durationSeconds: 600, publishedAt: '2026-01-01T00:00:00Z', available: true,
})

describe('local recommendations', () => {
  it('prefers topic and channel affinity while excluding watched videos', () => {
    const state = createDefaultState()
    const watched = video('watched0001', 'channel-a', 'education', ['typescript'])
    const related = video('related0001', 'channel-a', 'education', ['typescript'])
    const unrelated = video('other00001', 'channel-b', 'music', ['piano'])
    state.videos = { [watched.videoId]: watched, [related.videoId]: related, [unrelated.videoId]: unrelated }
    state.history[watched.videoId] = { videoId: watched.videoId, position: 60, duration: 600, watchedSeconds: 60, state: 'WATCHING', updatedAt: '2026-01-02T00:00:00Z' }
    const result = rankLocalRecommendations([watched, unrelated, related], state, Date.parse('2026-01-03T00:00:00Z'))
    expect(result.map((item) => item.video.videoId)).toEqual(['related0001', 'other00001'])
    expect(result[0].reason).toContain('Topic')
  })

  it('limits the top ten to two videos from one channel', () => {
    const state = createDefaultState()
    const candidates = Array.from({ length: 5 }, (_, index) => video(`video00000${index}`, 'same-channel', 'education'))
    expect(rankLocalRecommendations(candidates, state).map((item) => item.video.videoId)).toHaveLength(2)
  })
})
