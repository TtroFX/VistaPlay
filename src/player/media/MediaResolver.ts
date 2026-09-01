import type { ResolvedMedia } from './types'

export type MediaResolverErrorCode = 'RESOLVER_TIMEOUT' | 'RESOLVE_FAILED' | 'INVALID_RESPONSE' | 'NO_PLAYABLE_STREAM'

export class MediaResolverError extends Error {
  constructor(readonly code: MediaResolverErrorCode, message: string) {
    super(message)
    this.name = 'MediaResolverError'
  }
}

export interface MediaResolver {
  readonly id: string
  resolve(videoId: string, signal?: AbortSignal): Promise<ResolvedMedia>
}
