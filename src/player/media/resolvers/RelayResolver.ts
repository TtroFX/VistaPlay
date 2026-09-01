import { MediaResolverError, type MediaResolver } from '../MediaResolver'
import type { MediaResolverKind, MediaStream, ResolvedMedia } from '../types'

export const DEFAULT_MEDIA_RELAY_BASE = 'https://vistaplay-relay-ibukioike2009-7645s-projects.vercel.app'

export class RelayResolver implements MediaResolver {
  readonly id: string
  readonly baseUrl: string

  constructor(baseUrl = DEFAULT_MEDIA_RELAY_BASE) {
    this.baseUrl = normalizeBaseUrl(baseUrl)
    this.id = `relay:${new URL(this.baseUrl).host}`
  }

  async resolve(videoId: string, signal?: AbortSignal): Promise<ResolvedMedia> {
    const url = new URL('/api/resolve', `${this.baseUrl}/`)
    url.searchParams.set('videoId', videoId)
    const response = await fetch(url, {
      signal,
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new MediaResolverError('RESOLVE_FAILED', `Relay ${response.status}${detail ? `: ${detail.slice(0, 240)}` : ''}`)
    }

    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      throw new MediaResolverError('INVALID_RESPONSE', 'Relay returned invalid JSON')
    }
    return normalizeRelayResponse(videoId, payload)
  }
}

export function normalizeRelayResponse(videoId: string, payload: unknown): ResolvedMedia {
  if (!isRecord(payload) || payload.provider !== 'youtube' || payload.videoId !== videoId) {
    throw new MediaResolverError('INVALID_RESPONSE', 'Relay response does not match the requested YouTube video')
  }

  const streams = normalizeStreams(payload.streams)
  if (!streams.length) throw new MediaResolverError('NO_PLAYABLE_STREAM', 'Relay returned no proxied progressive media streams')

  const resolverRecord = isRecord(payload.resolver) ? payload.resolver : undefined
  const instance = typeof resolverRecord?.instance === 'string' && isHttpUrl(resolverRecord.instance)
    ? resolverRecord.instance.replace(/\/$/, '')
    : undefined
  if (!instance) throw new MediaResolverError('INVALID_RESPONSE', 'Relay did not identify its upstream resolver')

  const type = resolverKind(resolverRecord?.type)
  return {
    provider: 'youtube',
    videoId,
    duration: finiteNumber(payload.duration),
    streams,
    resolvedAt: finiteNumber(payload.resolvedAt) ?? Date.now(),
    expiresAt: finiteNumber(payload.expiresAt),
    resolver: { type, instance },
  }
}

function normalizeStreams(value: unknown): MediaStream[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((raw) => {
    if (!isRecord(raw) || typeof raw.url !== 'string' || !isHttpUrl(raw.url) || raw.proxied !== true) return []
    return [{
      url: raw.url,
      mimeType: stringValue(raw.mimeType),
      container: stringValue(raw.container),
      width: finiteNumber(raw.width),
      height: finiteNumber(raw.height),
      fps: finiteNumber(raw.fps),
      bitrate: finiteNumber(raw.bitrate),
      videoCodec: stringValue(raw.videoCodec),
      audioCodec: stringValue(raw.audioCodec),
      videoOnly: raw.videoOnly === true,
      audioOnly: raw.audioOnly === true,
      qualityLabel: stringValue(raw.qualityLabel),
      proxied: true,
    } satisfies MediaStream]
  })
}

function normalizeBaseUrl(value: string): string {
  const url = new URL(value)
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new MediaResolverError('INVALID_RESPONSE', 'Invalid relay URL')
  return url.toString().replace(/\/$/, '')
}

function resolverKind(value: unknown): MediaResolverKind {
  return value === 'piped' || value === 'invidious' || value === 'custom' ? value : 'custom'
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
