import { describe, expect, it } from 'vitest'
import { defaultSettings } from '../config/features'
import type { SearchResult } from '../domain/types'
import { filterAndSortSearchResults } from './searchRules'

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
})
