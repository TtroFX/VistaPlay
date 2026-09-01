import { ResolverPool } from './ResolverPool'
import { PipedResolver } from './resolvers/PipedResolver'
import { RelayResolver } from './resolvers/RelayResolver'
import type { ResolvedMedia } from './types'

const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.leptons.xyz',
  'https://pipedapi.nosebs.ru',
  'https://pipedapi-libre.kavin.rocks',
  'https://piped-api.privacy.com.de',
] as const

const configuredRelayBase = import.meta.env.VITE_MEDIA_RELAY_BASE?.trim()
const resolvers = configuredRelayBase
  ? [new RelayResolver(configuredRelayBase)]
  : PIPED_INSTANCES.map((instance) => new PipedResolver(instance))
const resolverPool = new ResolverPool(resolvers, { timeoutMs: 4_500 })

export async function resolveYoutubeMedia(videoId: string, signal?: AbortSignal): Promise<ResolvedMedia> {
  if (signal?.aborted) throw new DOMException('Resolution aborted', 'AbortError')
  return resolverPool.resolve(videoId, signal)
}

export function invalidateYoutubeMedia(videoId: string): void {
  resolverPool.invalidate(videoId)
}
