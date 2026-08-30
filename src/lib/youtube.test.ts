import { afterEach, describe, expect, it, vi } from 'vitest'
import { extractChapters, extractTimestamps, fetchLatestUploads, fetchSubscriptionChannelIds, parseDuration, parseYouTubeInput } from './youtube'

afterEach(() => vi.unstubAllGlobals())

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
})
