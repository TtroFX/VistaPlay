import { afterEach, describe, expect, it, vi } from 'vitest'
import { dbPut } from '../data/db'
import type { SearchFilters } from '../domain/types'
import { extractChapters, extractTimestamps, fetchLatestUploads, fetchPlaylist, fetchSubscriptionChannelIds, parseDuration, parseYouTubeInput, parseYouTubeVideoId, searchRemote } from './youtube'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('YouTube parsing', () => {
  it('recognizes video, channel and playlist links', () => {
    expect(parseYouTubeInput('https://youtu.be/dQw4w9WgXcQ')?.type).toBe('video')
    expect(parseYouTubeInput('https://www.youtube.com/channel/UC123')?.id).toBe('UC123')
    expect(parseYouTubeInput('https://www.youtube.com/playlist?list=PL123')?.type).toBe('playlist')
    expect(parseYouTubeInput('https://example.com/watch?v=dQw4w9WgXcQ')).toBeUndefined()
  })
  it('recognizes a YouTube URL embedded in shared text', () => {
    expect(parseYouTubeInput('おすすめ動画 https://youtu.be/TESTVIDEO01?t=12')).toEqual({ type: 'video', id: 'TESTVIDEO01' })
  })
  it('accepts only video inputs where a Video ID is required', () => {
    expect(parseYouTubeVideoId('https://youtu.be/TESTVIDEO01')).toBe('TESTVIDEO01')
    expect(parseYouTubeVideoId('https://www.youtube.com/channel/UC123')).toBeUndefined()
    expect(parseYouTubeVideoId('https://www.youtube.com/playlist?list=PL123')).toBeUndefined()
  })
  it('parses ISO duration', () => expect(parseDuration('PT1H2M3S')).toBe(3723))
  it('extracts valid timestamps and rejects impossible or out-of-range values', () => {
    expect(extractTimestamps('intro 1:23 bad 2:99 end 10:00', 300)).toEqual([83])
  })
  it('sorts and deduplicates description chapters', () => {
    expect(extractChapters('1:00 Middle\n0:00 Start\n1:00 Duplicate', 120)).toEqual([{ start: 0, title: 'Start' }, { start: 60, title: 'Duplicate' }])
  })
  it('loads Google subscriptions with a bearer token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [{ snippet: { resourceId: { channelId: 'UC-one' } } }, { snippet: { resourceId: { channelId: 'UC-two' } } }] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(fetchSubscriptionChannelIds('provider-token')).resolves.toEqual(['UC-one', 'UC-two'])
    expect(fetchMock.mock.calls[0][1]?.headers).toEqual({ Authorization: 'Bearer provider-token' })
  })
  it('resolves upload playlists and verifies their video metadata', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ contentDetails: { relatedPlaylists: { uploads: 'UU-one' } } }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ contentDetails: { videoId: 'TESTVIDEO01' } }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ id: 'TESTVIDEO01', snippet: { title: 'Verified upload', publishedAt: '2026-01-02T00:00:00Z' }, contentDetails: { duration: 'PT2M' } }] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await fetchLatestUploads(['UC-one'], 'provider-token')
    expect(result).toMatchObject([{ videoId: 'TESTVIDEO01', title: 'Verified upload', durationSeconds: 120 }])
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
  it('loads playlist identity, pagination and verified videos', async () => {
    vi.stubEnv('VITE_YOUTUBE_API_KEY', 'test-key')
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('/playlists')) return Promise.resolve(new Response(JSON.stringify({ items: [{ id: 'PL-production', snippet: { title: 'Production playlist', channelId: 'UC-owner', channelTitle: 'Owner', description: 'Playlist description' }, contentDetails: { itemCount: 26 } }] }), { status: 200 }))
      if (url.pathname.endsWith('/playlistItems')) return Promise.resolve(new Response(JSON.stringify({ items: [{ contentDetails: { videoId: 'PLAYLIST001' } }], nextPageToken: 'page-two' }), { status: 200 }))
      return Promise.resolve(new Response(JSON.stringify({ items: [{ id: 'PLAYLIST001', snippet: { title: 'Verified playlist video', channelTitle: 'Owner' }, contentDetails: { duration: 'PT3M' } }] }), { status: 200 }))
    })
    vi.stubGlobal('fetch', fetchMock)
    const result = await fetchPlaylist('PL-production')
    expect(result.playlist).toMatchObject({ title: 'Production playlist', channelId: 'UC-owner', itemCount: 26 })
    expect(result.items).toMatchObject([{ videoId: 'PLAYLIST001', title: 'Verified playlist video', durationSeconds: 180 }])
    expect(result.nextPageToken).toBe('page-two')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('uses a recently expired search result when the API is unavailable', async () => {
    vi.stubEnv('VITE_YOUTUBE_API_KEY', 'test-key')
    const filters: SearchFilters = { type: 'channel', publishedAfter: '', duration: 'any', live: 'any', shorts: 'include', excludeChannels: [], excludeKeywords: [], whitelistOnly: false }
    const cacheKey = `search:${JSON.stringify({ query: 'cached query', filters, pageToken: undefined })}`
    const fallback = { items: [{ type: 'channel' as const, id: 'UC-cached', title: 'Cached channel' }] }
    await dbPut('cache', cacheKey, { expiresAt: Date.now() - 1000, value: fallback })
    const fetchMock = vi.fn().mockResolvedValue(new Response('quota unavailable', { status: 403 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(searchRemote('cached query', filters)).resolves.toEqual(fallback)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
