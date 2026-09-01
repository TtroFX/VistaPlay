import { ResolverPool } from './ResolverPool'
import { NativePipedResolver } from './resolvers/NativePipedResolver'
import { PipedResolver } from './resolvers/PipedResolver'
import { RelayResolver } from './resolvers/RelayResolver'
import type { ResolvedMedia } from './types'

// Current high-priority entries from TeamPiped's maintained public-instance list.
// Keep native Android and browser fallback lists aligned.
const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.leptons.xyz',
  'https://pipedapi.nosebs.ru',
  'https://pipedapi-libre.kavin.rocks',
  'https://piped-api.privacy.com.de',
  'https://pipedapi.adminforge.de',
] as const

const configuredRelayBase = import.meta.env.VITE_MEDIA_RELAY_BASE?.trim()
const nativeBridge = typeof window === 'undefined' ? undefined : window.VistaPlayNative
const resolvers = configuredRelayBase
  ? [new RelayResolver(configuredRelayBase)]
  : nativeBridge
    ? [new NativePipedResolver(nativeBridge)]
    : PIPED_INSTANCES.map((instance) => new PipedResolver(instance))
const resolverPool = new ResolverPool(resolvers, { timeoutMs: nativeBridge && !configuredRelayBase ? 60_000 : 4_500 })

export async function resolveYoutubeMedia(videoId: string, signal?: AbortSignal): Promise<ResolvedMedia> {
  if (signal?.aborted) throw new DOMException('Resolution aborted', 'AbortError')
  return resolverPool.resolve(videoId, signal)
}

export function invalidateYoutubeMedia(videoId: string): void {
  resolverPool.invalidate(videoId)
}
