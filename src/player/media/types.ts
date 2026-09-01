export type MediaResolverKind = 'piped' | 'invidious' | 'custom'

export interface MediaStream {
  url: string
  mimeType?: string
  container?: string
  width?: number
  height?: number
  fps?: number
  bitrate?: number
  videoCodec?: string
  audioCodec?: string
  videoOnly: boolean
  audioOnly: boolean
  qualityLabel?: string
  proxied: boolean
}

export interface ResolvedMedia {
  provider: 'youtube'
  videoId: string
  duration?: number
  streams: MediaStream[]
  resolvedAt: number
  expiresAt?: number
  resolver: {
    type: MediaResolverKind
    instance: string
  }
}

export interface ResolverHealth {
  failures: number
  lastFailure?: number
  lastSuccess?: number
  latency?: number
}
