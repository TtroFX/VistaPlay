import { describe, expect, it } from 'vitest'
import { defaultSettings } from '../config/features'
import type { SearchResult } from '../domain/types'
import { filterAndSortSearchResults, searchLocalVideos } from './searchRules'

const result = (id: string, channelId: string, publishedAt: string, viewCount: number, title = id): SearchResult => ({
  id, type: 'video', title, channelId, video: { videoId: id, title, channelId, publishedAt, viewCount, durationSeconds: 600, liveStatus: 'none' },
})

describe('search result rules', () => {
  it('applies blacklist before whitelist-only mode', () => {
    const settings = structuredClone(defaultSettings)
    settings.blacklist.channels = ['blocked']
    settings.whitelistChannels = ['blocked', 'allowed']
    settings.whitelistOnly = true
    const visible = filterAndSortSearchResults([result('one', 'blocked', '2026-01-01', 1), result('two', 'allowed', '2026-01-01', 1)], settings, { shorts: true, live: true, whitelistOnly: false, sort: 'relevance' })
    expect(visible.map((item) => item.id)).toEqual(['two'])
  })

  it('removes disabled contextual content and applies local sorting', () => {
    const short = result('short', 'a', '2026-01-03', 20); short.video!.durationSeconds = 30
    const live = result('live', 'b', '2026-01-04', 30); live.video!.liveStatus = 'live'
    const older = result('older', 'c', '2026-01-01', 50)
    const newer = result('newer', 'd', '2026-01-02', 10)
    const visible = filterAndSortSearchResults([short, live, older, newer], structuredClone(defaultSettings), { shorts: false, live: false, whitelistOnly: false, sort: 'newest' })
    expect(visible.map((item) => item.id)).toEqual(['newer', 'older'])
  })

  it('searches cached video metadata with the active API-style filters', () => {
    const videos = [
      { videoId: 'one', title: 'TypeScript architecture', channelId: 'allowed', channelTitle: 'Engineering', durationSeconds: 600, publishedAt: '2026-05-02T00:00:00Z', liveStatus: 'none' as const },
      { videoId: 'two', title: 'TypeScript quick tip #shorts', channelId: 'allowed', durationSeconds: 30, publishedAt: '2026-05-03T00:00:00Z', liveStatus: 'none' as const },
      { videoId: 'three', title: 'TypeScript architecture', channelId: 'blocked', durationSeconds: 800, publishedAt: '2026-05-03T00:00:00Z', liveStatus: 'none' as const },
    ]
    const results = searchLocalVideos(videos, 'typescript architecture', {
      type: 'video', duration: 'medium', live: 'any', shorts: 'exclude', publishedAfter: '2026-05-01',
      excludeChannels: ['blocked'], excludeKeywords: [], whitelistOnly: false,
    })
    expect(results.map((item) => item.id)).toEqual(['one'])
  })

  it('does not fabricate channel or playlist results from local video metadata', () => {
    expect(searchLocalVideos([], 'anything', { type: 'channel', duration: 'any', live: 'any', shorts: 'include', excludeChannels: [], excludeKeywords: [], whitelistOnly: false })).toEqual([])
  })
})
