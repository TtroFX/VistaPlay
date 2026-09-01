import { afterEach, describe, expect, it, vi } from 'vitest'
import handler from './resolve.js'

function createResponse() {
  return {
    statusCode: 200,
    headers: new Map(),
    body: undefined,
    ended: false,
    setHeader(name, value) { this.headers.set(name, value) },
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this },
    end() { this.ended = true },
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('resolver relay', () => {
  it('rejects invalid video ids without contacting a resolver', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const response = createResponse()

    await handler({ method: 'GET', query: { videoId: 'bad' }, url: '/api/resolve?videoId=bad' }, response)

    expect(response.statusCode).toBe(400)
    expect(response.body).toEqual({ error: 'INVALID_VIDEO_ID' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns only instance-proxied progressive streams', async () => {
    const fetchMock = vi.fn(async (input) => {
      const url = new URL(String(input))
      if (url.host !== 'inv.nadeko.net') throw new Error('offline')
      return {
        ok: true,
        status: 200,
        json: async () => ({
          lengthSeconds: '12',
          formatStreams: [
            {
              url: 'https://inv.nadeko.net/videoplayback?local=true&id=M7lc1UVf-VE',
              type: 'video/mp4; codecs="avc1.42001E, mp4a.40.2"',
              qualityLabel: '360p',
              resolution: '640x360',
              container: 'mp4',
              bitrate: 500000,
              encoding: 'h264',
            },
            {
              url: 'https://rr1---sn.example.googlevideo.com/videoplayback?id=M7lc1UVf-VE',
              type: 'video/mp4',
              qualityLabel: '720p',
            },
          ],
        }),
      }
    })
    vi.stubGlobal('fetch', fetchMock)
    const response = createResponse()

    await handler({ method: 'GET', query: { videoId: 'M7lc1UVf-VE' }, url: '/api/resolve?videoId=M7lc1UVf-VE' }, response)

    expect(response.statusCode).toBe(200)
    expect(response.body.videoId).toBe('M7lc1UVf-VE')
    expect(response.body.duration).toBe(12)
    expect(response.body.streams).toHaveLength(1)
    expect(response.body.streams[0]).toMatchObject({ proxied: true, height: 360, container: 'mp4' })
    expect(new URL(response.body.streams[0].url).host).toBe('inv.nadeko.net')
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })
})
