import { MediaResolverError, type MediaResolver } from './MediaResolver'
import { ResolutionCache } from './cache/ResolutionCache'
import type { ResolvedMedia, ResolverHealth } from './types'

interface ResolverPoolOptions {
  timeoutMs?: number
  cooldownMs?: number
  failureThreshold?: number
  cache?: ResolutionCache
}

export class ResolverPool {
  private readonly health = new Map<string, ResolverHealth>()
  private readonly timeoutMs: number
  private readonly cooldownMs: number
  private readonly failureThreshold: number
  private readonly cache: ResolutionCache

  constructor(private readonly resolvers: readonly MediaResolver[], options: ResolverPoolOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 4500
    this.cooldownMs = options.cooldownMs ?? 10 * 60 * 1000
    this.failureThreshold = options.failureThreshold ?? 3
    this.cache = options.cache ?? new ResolutionCache()
  }

  getHealth(): ReadonlyMap<string, ResolverHealth> {
    return this.health
  }

  invalidate(videoId: string): void {
    this.cache.invalidate(videoId)
  }

  async resolve(videoId: string, signal?: AbortSignal): Promise<ResolvedMedia> {
    const cached = this.cache.get(videoId)
    if (cached) return cached
    if (!videoId) throw new MediaResolverError('INVALID_RESPONSE', 'Video ID is required')
    if (!this.resolvers.length) throw new MediaResolverError('RESOLVE_FAILED', 'No media resolvers are configured')

    const now = Date.now()
    const ordered = [...this.resolvers].sort((a, b) => this.rankResolver(a.id, now) - this.rankResolver(b.id, now))
    const failures: string[] = []

    for (const resolver of ordered) {
      if (signal?.aborted) throw new DOMException('Resolution aborted', 'AbortError')
      const startedAt = performance.now()
      try {
        const media = await this.resolveWithTimeout(resolver, videoId, signal)
        if (media.videoId !== videoId || !media.streams.length) throw new MediaResolverError('INVALID_RESPONSE', `${resolver.id} returned unusable media metadata`)
        this.health.set(resolver.id, {
          failures: 0,
          lastSuccess: Date.now(),
          latency: Math.max(0, performance.now() - startedAt),
        })
        this.cache.set(media)
        return media
      } catch (error) {
        if (signal?.aborted) throw new DOMException('Resolution aborted', 'AbortError')
        const previous = this.health.get(resolver.id) ?? { failures: 0 }
        this.health.set(resolver.id, {
          ...previous,
          failures: previous.failures + 1,
          lastFailure: Date.now(),
          latency: Math.max(0, performance.now() - startedAt),
        })
        failures.push(`${resolver.id}: ${error instanceof Error ? error.message : 'unknown failure'}`)
      }
    }

    throw new MediaResolverError('RESOLVE_FAILED', `All media resolvers failed (${failures.join('; ')})`)
  }

  private rankResolver(id: string, now: number): number {
    const health = this.health.get(id)
    if (!health) return 500_000
    const coolingDown = health.failures >= this.failureThreshold && health.lastFailure !== undefined && now - health.lastFailure < this.cooldownMs
    if (coolingDown) return 10_000_000 + health.failures * 1000
    const latency = health.latency ?? 5000
    if (health.lastSuccess !== undefined) {
      const agePenalty = Math.min(300_000, Math.max(0, now - health.lastSuccess))
      return agePenalty + latency + health.failures * 10_000
    }
    return 1_000_000 + health.failures * 10_000 + latency
  }

  private async resolveWithTimeout(resolver: MediaResolver, videoId: string, parentSignal?: AbortSignal): Promise<ResolvedMedia> {
    const controller = new AbortController()
    const abort = () => controller.abort()
    parentSignal?.addEventListener('abort', abort, { once: true })
    let timeoutId = 0
    try {
      const timeout = new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(() => {
          controller.abort()
          reject(new MediaResolverError('RESOLVER_TIMEOUT', `${resolver.id} timed out after ${this.timeoutMs}ms`))
        }, this.timeoutMs)
      })
      return await Promise.race([resolver.resolve(videoId, controller.signal), timeout])
    } finally {
      window.clearTimeout(timeoutId)
      parentSignal?.removeEventListener('abort', abort)
    }
  }
}
