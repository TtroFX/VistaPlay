import { describe, expect, it } from 'vitest'
import { NativePipedResolver } from './NativePipedResolver'

class FakeNativeBridge implements VistaPlayNativeBridge {
  onmessage: ((event: VistaPlayNativeMessageEvent) => void) | null = null

  constructor(private readonly resolverType: 'piped' | 'invidious' = 'piped') {}

  postMessage(message: string): void {
    const request = JSON.parse(message) as { type?: string; requestId?: string; videoId?: string }
    if (request.type !== 'resolveYouTubeMedia' || !request.requestId || !request.videoId) return
    queueMicrotask(() => {
      const response = this.resolverType === 'invidious'
        ? {
            type: 'resolveYouTubeMediaResult',
            requestId: request.requestId,
            ok: true,
            resolverType: 'invidious',
            instance: 'https://inv.example',
            payload: {
              lengthSeconds: 120,
              formatStreams: [{
                url: `https://inv.example/videoplayback?id=${request.videoId}`,
                type: 'video/mp4; codecs="avc1.42001E, mp4a.40.2"',
                container: 'mp4',
                quality: 'hd720',
                qualityLabel: '720p',
                resolution: '1280x720',
                bitrate: 1_000_000,
                encoding: 'h264',
              }],
            },
          }
        : {
            type: 'resolveYouTubeMediaResult',
            requestId: request.requestId,
            ok: true,
            resolverType: 'piped',
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
          }
      this.onmessage?.({ data: JSON.stringify(response) })
    })
  }
}

describe('NativePipedResolver', () => {
  it('normalizes a native bridge Piped response into playable media', async () => {
    const resolver = new NativePipedResolver(new FakeNativeBridge('piped'))
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

  it('normalizes an Invidious native fallback response into playable media', async () => {
    const resolver = new NativePipedResolver(new FakeNativeBridge('invidious'))
    const media = await resolver.resolve('jNQXAC9IVRw')

    expect(media.videoId).toBe('jNQXAC9IVRw')
    expect(media.resolver).toEqual({ type: 'invidious', instance: 'https://inv.example' })
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
