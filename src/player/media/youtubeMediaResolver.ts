import { ResolverPool } from './ResolverPool'
import { DEFAULT_MEDIA_RELAY_BASE, RelayResolver } from './resolvers/RelayResolver'
import type { ResolvedMedia } from './types'

const configuredRelayBase = import.meta.env.VITE_MEDIA_RELAY_BASE?.trim() || DEFAULT_MEDIA_RELAY_BASE
const resolverPool = new ResolverPool([new RelayResolver(configuredRelayBase)], { timeoutMs: 8_000 })

export async function resolveYoutubeMedia(videoId: string, signal?: AbortSignal): Promise<ResolvedMedia> {
  if (signal?.aborted) throw new DOMException('Resolution aborted', 'AbortError')
  return resolverPool.resolve(videoId, signal)
}

export function invalidateYoutubeMedia(videoId: string): void {
  resolverPool.invalidate(videoId)
}
