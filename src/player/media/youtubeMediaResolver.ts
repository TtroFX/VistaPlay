import { ResolverPool } from './ResolverPool'
import { InvidiousResolver } from './resolvers/InvidiousResolver'
import { discoverInvidiousInstances, INVIDIOUS_BOOTSTRAP_INSTANCES } from './resolvers/invidiousInstances'
import type { ResolvedMedia } from './types'

let resolverPool: ResolverPool | undefined
let resolverPoolPromise: Promise<ResolverPool> | undefined

async function getResolverPool(): Promise<ResolverPool> {
  if (resolverPool) return resolverPool
  if (!resolverPoolPromise) {
    resolverPoolPromise = discoverInvidiousInstances()
      .catch(() => [...INVIDIOUS_BOOTSTRAP_INSTANCES])
      .then((instances) => {
        const candidates = [...new Set([...instances, ...INVIDIOUS_BOOTSTRAP_INSTANCES])].slice(0, 8)
        resolverPool = new ResolverPool(candidates.map((instance) => new InvidiousResolver(instance)), { timeoutMs: 4500 })
        return resolverPool
      })
  }
  return resolverPoolPromise
}

export async function resolveYoutubeMedia(videoId: string, signal?: AbortSignal): Promise<ResolvedMedia> {
  const pool = await getResolverPool()
  if (signal?.aborted) throw new DOMException('Resolution aborted', 'AbortError')
  return pool.resolve(videoId, signal)
}

export function invalidateYoutubeMedia(videoId: string): void {
  resolverPool?.invalidate(videoId)
}
