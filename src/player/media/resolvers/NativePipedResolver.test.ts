import { describe, expect, it } from 'vitest'
import { NativePipedResolver } from './NativePipedResolver'

class FakeNativeBridge implements VistaPlayNativeBridge {
  onmessage: ((event: VistaPlayNativeMessageEvent) => void) | null = null

  postMessage(message: string): void {
    const request = JSON.parse(message) as { type?: string; requestId?: string; videoId?: string }
    if (request.type !== 'resolveYouTubeMedia' || !request.requestId || !request.videoId) return
    queueMicrotask(() => {
      this.onmessage?.({
        data: JSON.stringify({
          type: 'resolveYouTubeMediaResult',
          requestId: request.requestId,
          ok: true,
          instance: 'https://pipedapi.example',
          payload: {
            duration: 120,
            proxyUrl: 'https://pipedproxy.example',
            videoStreams: [{
              url: `https://pipedproxy.example/videoplayback?id=${request.videoId}`,
              mimeType: 'video/mp4; codecs="avc1.42001E, mp4a.40.2"',
              format: 'MPEG_4',
              quality: '720p',
              codec: 'h264',
              bitrate: 1_000_000,
              width: 1280,
              height: 720,
              fps: 30,
              videoOnly: false,
            }],
            audioStreams: [],
          },
        }),
      })
    })
  }
}

describe('NativePipedResolver', () => {
  it('normalizes a native bridge Piped response into playable media', async () => {
    const resolver = new NativePipedResolver(new FakeNativeBridge())
    const media = await resolver.resolve('M7lc1UVf-VE')

    expect(media.videoId).toBe('M7lc1UVf-VE')
    expect(media.resolver).toEqual({ type: 'piped', instance: 'https://pipedapi.example' })
    expect(media.streams).toHaveLength(1)
    expect(media.streams[0]).toMatchObject({
      proxied: true,
      videoOnly: false,
      audioOnly: false,
      container: 'mp4',
      height: 720,
    })
  })
})
