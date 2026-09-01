import { describe, expect, it, vi } from 'vitest'
import type { MediaResolver } from './MediaResolver'
import { ResolverPool } from './ResolverPool'
import type { ResolvedMedia } from './types'

function media(videoId: string, instance = 'test'): ResolvedMedia {
  return {
    provider: 'youtube',
    videoId,
    streams: [{ url: 'https://media.example/video.mp4', videoOnly: false, audioOnly: false, proxied: true }],
    resolvedAt: Date.now(),
    resolver: { type: 'custom', instance },
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

  it('prefers a previously successful resolver and avoids retrying a known failure first', async () => {
    const order: string[] = []
    const first: MediaResolver = {
      id: 'first',
      resolve: vi.fn(async () => { order.push('first'); throw new Error('down') }),
    }
    const second: MediaResolver = {
      id: 'second',
      resolve: vi.fn(async (videoId: string) => { order.push('second'); return media(videoId, 'second') }),
    }
    const pool = new ResolverPool([first, second], { timeoutMs: 100 })

    await pool.resolve('one')
    order.length = 0
    await pool.resolve('two')
    expect(order[0]).toBe('second')
  })
})
