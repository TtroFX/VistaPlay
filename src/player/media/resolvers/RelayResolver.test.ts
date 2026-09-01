import { afterEach, describe, expect, it, vi } from 'vitest'
import { MediaResolverError } from '../MediaResolver'
import { RelayResolver, normalizeRelayResponse } from './RelayResolver'

const VIDEO_ID = 'M7lc1UVf-VE'

function relayPayload() {
  return {
    provider: 'youtube',
    videoId: VIDEO_ID,
    duration: 12,
    resolvedAt: Date.now(),
    resolver: { type: 'invidious', instance: 'https://inv.nadeko.net' },
    streams: [{
      url: 'https://inv.nadeko.net/videoplayback?local=true&id=M7lc1UVf-VE',
      mimeType: 'video/mp4; codecs="avc1.42001E, mp4a.40.2"',
      container: 'mp4',
      width: 640,
      height: 360,
      videoOnly: false,
      audioOnly: false,
      qualityLabel: '360p',
      proxied: true,
    }],
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('RelayResolver', () => {
  it('resolves sanitized proxied media through the relay endpoint', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => new Response(JSON.stringify(relayPayload()), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const resolver = new RelayResolver('https://relay.example')
    const media = await resolver.resolve(VIDEO_ID)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toBe(`https://relay.example/api/resolve?videoId=${VIDEO_ID}`)
    expect(media.resolver).toEqual({ type: 'invidious', instance: 'https://inv.nadeko.net' })
    expect(media.streams[0]).toMatchObject({ proxied: true, height: 360, videoOnly: false, audioOnly: false })
  })

  it('rejects non-proxied stream payloads', () => {
    const payload = relayPayload()
    payload.streams[0].proxied = false
    expect(() => normalizeRelayResponse(VIDEO_ID, payload)).toThrowError(MediaResolverError)
  })
})
