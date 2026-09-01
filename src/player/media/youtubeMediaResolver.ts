import { ResolverPool } from './ResolverPool'
import { NativePipedResolver } from './resolvers/NativePipedResolver'
import { RelayResolver } from './resolvers/RelayResolver'
import type { ResolvedMedia } from './types'

const configuredRelayBase = import.meta.env.VITE_MEDIA_RELAY_BASE?.trim()
const relayResolver = configuredRelayBase ? new RelayResolver(configuredRelayBase) : new RelayResolver()
const nativeBridge = typeof window === 'undefined' ? undefined : window.VistaPlayNative

// PWA is the primary playback target. Always resolve through the VistaPlay relay so
// browser CORS and third-party public-instance availability are not part of playback.
// The Android bridge remains a secondary fallback only for the packaged app.
const resolvers = nativeBridge
  ? [relayResolver, new NativePipedResolver(nativeBridge)]
  : [relayResolver]
const resolverPool = new ResolverPool(resolvers, { timeoutMs: 15_000 })

export async function resolveYoutubeMedia(videoId: string, signal?: AbortSignal): Promise<ResolvedMedia> {
  if (signal?.aborted) throw new DOMException('Resolution aborted', 'AbortError')
  return resolverPool.resolve(videoId, signal)
}

export function invalidateYoutubeMedia(videoId: string): void {
  resolverPool.invalidate(videoId)
}
