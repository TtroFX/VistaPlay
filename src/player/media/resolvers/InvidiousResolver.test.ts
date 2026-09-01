import { describe, expect, it } from 'vitest'
import { normalizeInvidiousResponse } from './InvidiousResolver'
import { parseInvidiousInstanceMarkdown } from './invidiousInstances'

describe('Invidious resolver normalization', () => {
  it('normalizes local progressive streams into VistaPlay muxed media', () => {
    const media = normalizeInvidiousResponse('video123', 'https://inv.example', {
      lengthSeconds: 120,
      formatStreams: [
        {
          url: 'https://inv.example/videoplayback?expire=2000000000&itag=22',
          type: 'video/mp4; codecs="avc1.64001F, mp4a.40.2"',
          quality: 'hd720',
          bitrate: '1500000',
          container: 'mp4',
          encoding: 'h264',
          qualityLabel: '720p',
          resolution: '1280x720',
        },
      ],
    })

    expect(media).toMatchObject({
      provider: 'youtube',
      videoId: 'video123',
      duration: 120,
      resolver: { type: 'invidious', instance: 'https://inv.example' },
      expiresAt: 2_000_000_000_000,
    })
    expect(media.streams).toEqual([
      expect.objectContaining({
        container: 'mp4',
        width: 1280,
        height: 720,
        bitrate: 1_500_000,
        videoOnly: false,
        audioOnly: false,
        proxied: true,
      }),
    ])
  })

  it('parses only clearnet HTTPS instances from the official markdown list', () => {
    const markdown = `* [inv.one.example](https://inv.one.example) 🇯🇵\n* [inv.two.example](https://inv.two.example/) 🇺🇸\n* onion.example (Onion)`
    expect(parseInvidiousInstanceMarkdown(markdown)).toEqual(['https://inv.one.example', 'https://inv.two.example'])
  })
})
