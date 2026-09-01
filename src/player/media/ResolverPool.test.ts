import { describe, expect, it, vi } from 'vitest'
import type { MediaResolver } from './MediaResolver'
import { ResolverPool } from './ResolverPool'
import type { ResolvedMedia } from './types'

function media(videoId: string): ResolvedMedia {
  return {
    provider: 'youtube',
    videoId,
    streams: [{ url: 'https://media.example/video.mp4', videoOnly: false, audioOnly: false, proxied: true }],
    resolvedAt: Date.now(),
    resolver: { type: 'custom', instance: 'test' },
  }
}

describe('ResolverPool', () => {
  it('fails over to the next resolver and caches the successful result', async () => {
    const fail = vi.fn(async () => { throw new Error('down') })
    const succeed = vi.fn(async (videoId: string) => media(videoId))
    const resolvers: MediaResolver[] = [
      { id: 'first', resolve: fail },
      { id: 'second', resolve: succeed },
    ]
    const pool = new ResolverPool(resolvers, { timeoutMs: 100 })

    await expect(pool.resolve('abc123')).resolves.toMatchObject({ videoId: 'abc123' })
    await expect(pool.resolve('abc123')).resolves.toMatchObject({ videoId: 'abc123' })
    expect(fail).toHaveBeenCalledTimes(1)
    expect(succeed).toHaveBeenCalledTimes(1)
  })
})
