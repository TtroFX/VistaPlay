import { ResolverPool } from './ResolverPool'
import { PipedResolver } from './resolvers/PipedResolver'
import { discoverPipedInstances, PIPED_BOOTSTRAP_INSTANCES } from './resolvers/pipedInstances'
import type { ResolvedMedia } from './types'

let resolverPool: ResolverPool | undefined
let resolverPoolPromise: Promise<ResolverPool> | undefined

async function getResolverPool(): Promise<ResolverPool> {
  if (resolverPool) return resolverPool
  if (!resolverPoolPromise) {
    resolverPoolPromise = discoverPipedInstances()
      .catch(() => [...PIPED_BOOTSTRAP_INSTANCES])
      .then((instances) => {
        const candidates = [...new Set([...instances, ...PIPED_BOOTSTRAP_INSTANCES])].slice(0, 8)
        resolverPool = new ResolverPool(candidates.map((instance) => new PipedResolver(instance)), { timeoutMs: 4000 })
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
