import { ResolverPool } from './ResolverPool'
import { NativePipedResolver } from './resolvers/NativePipedResolver'
import { PipedResolver } from './resolvers/PipedResolver'
import { RelayResolver } from './resolvers/RelayResolver'
import type { ResolvedMedia } from './types'

const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.tokhmi.xyz',
  'https://pipedapi.moomoo.me',
  'https://pipedapi.syncpundit.io',
  'https://api-piped.mha.fi',
  'https://piped-api.garudalinux.org',
] as const

const configuredRelayBase = import.meta.env.VITE_MEDIA_RELAY_BASE?.trim()
const nativeBridge = typeof window === 'undefined' ? undefined : window.VistaPlayNative
const resolvers = configuredRelayBase
  ? [new RelayResolver(configuredRelayBase)]
  : nativeBridge
    ? [new NativePipedResolver(nativeBridge)]
    : PIPED_INSTANCES.map((instance) => new PipedResolver(instance))
const resolverPool = new ResolverPool(resolvers, { timeoutMs: nativeBridge && !configuredRelayBase ? 50_000 : 4_500 })

export async function resolveYoutubeMedia(videoId: string, signal?: AbortSignal): Promise<ResolvedMedia> {
  if (signal?.aborted) throw new DOMException('Resolution aborted', 'AbortError')
  return resolverPool.resolve(videoId, signal)
}

export function invalidateYoutubeMedia(videoId: string): void {
  resolverPool.invalidate(videoId)
}
