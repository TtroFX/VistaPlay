import { describe, expect, it } from 'vitest'
import { normalizePipedResponse } from './PipedResolver'
import { parsePipedInstanceMarkdown } from './pipedInstances'

describe('Piped resolver normalization', () => {
  it('normalizes muxed, video-only and audio streams without leaking provider details into playback', () => {
    const media = normalizePipedResponse('video123', 'https://pipedapi.example', {
      duration: 120,
      proxyUrl: 'https://proxy.example',
      videoStreams: [
        { url: 'https://proxy.example/videoplayback?expire=2000000000', mimeType: 'video/mp4', format: 'MPEG_4', quality: '720p', codec: 'avc1', width: 1280, height: 720, fps: 30, bitrate: 1_000_000, videoOnly: false },
        { url: 'https://proxy.example/videoplayback?expire=2000000000&v=2', mimeType: 'video/mp4', format: 'MPEG_4', quality: '1080p', codec: 'avc1', width: 1920, height: 1080, fps: 30, videoOnly: true },
      ],
      audioStreams: [
        { url: 'https://proxy.example/videoplayback?expire=2000000000&a=1', mimeType: 'audio/mp4', format: 'M4A', quality: '128 kbps', codec: 'mp4a.40.2', bitrate: 128000, videoOnly: false },
      ],
    })

    expect(media.videoId).toBe('video123')
    expect(media.duration).toBe(120)
    expect(media.resolver).toEqual({ type: 'piped', instance: 'https://pipedapi.example' })
    expect(media.streams).toHaveLength(3)
    expect(media.streams[0]).toMatchObject({ container: 'mp4', height: 720, videoOnly: false, audioOnly: false, proxied: true })
    expect(media.streams[2]).toMatchObject({ container: 'mp4', videoOnly: false, audioOnly: true, proxied: true, audioCodec: 'mp4a.40.2' })
    expect(media.expiresAt).toBe(2_000_000_000_000)
  })

  it('parses current Piped documentation instance table rows', () => {
    const markdown = `| Name | API URL | Location |\n| --- | --- | --- |\n| One | https://api.one.example | JP |\n| Two | https://api.two.example/ | US |`
    expect(parsePipedInstanceMarkdown(markdown)).toEqual(['https://api.one.example', 'https://api.two.example'])
  })
})
