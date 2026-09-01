import { MediaResolverError, type MediaResolver } from '../MediaResolver'
import type { MediaStream, ResolvedMedia } from '../types'

interface InvidiousFormatStream {
  url?: unknown
  type?: unknown
  quality?: unknown
  bitrate?: unknown
  container?: unknown
  encoding?: unknown
  qualityLabel?: unknown
  resolution?: unknown
}

export class InvidiousResolver implements MediaResolver {
  readonly id: string
  readonly instance: string

  constructor(instance: string) {
    this.instance = normalizeInstance(instance)
    this.id = `invidious:${new URL(this.instance).host}`
  }

  async resolve(videoId: string, signal?: AbortSignal): Promise<ResolvedMedia> {
    const url = new URL(`/api/v1/videos/${encodeURIComponent(videoId)}`, `${this.instance}/`)
    url.searchParams.set('local', 'true')
    const response = await fetch(url, {
      signal,
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) throw new MediaResolverError('RESOLVE_FAILED', `Invidious ${response.status} ${response.statusText}`)

    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      throw new MediaResolverError('INVALID_RESPONSE', 'Invidious returned invalid JSON')
    }
    return normalizeInvidiousResponse(videoId, this.instance, payload)
  }
}

export function normalizeInvidiousResponse(videoId: string, instance: string, payload: unknown): ResolvedMedia {
  if (!isRecord(payload)) throw new MediaResolverError('INVALID_RESPONSE', 'Invidious response is not an object')
  const streams = normalizeFormatStreams(payload.formatStreams, instance)
  if (!streams.length) throw new MediaResolverError('NO_PLAYABLE_STREAM', 'Invidious returned no progressive media streams')

  return {
    provider: 'youtube',
    videoId,
    duration: parseFiniteNumber(payload.lengthSeconds),
    streams,
    resolvedAt: Date.now(),
    expiresAt: earliestExpiry(streams),
    resolver: { type: 'invidious', instance: normalizeInstance(instance) },
  }
}

function normalizeFormatStreams(value: unknown, instance: string): MediaStream[] {
  if (!Array.isArray(value)) return []
  const instanceHost = new URL(normalizeInstance(instance)).host

  return value.flatMap((raw) => {
    if (!isRecord(raw)) return []
    const record = raw as InvidiousFormatStream
    if (typeof record.url !== 'string' || !isHttpUrl(record.url)) return []
    const resolution = stringValue(record.resolution)
    const dimensions = parseResolution(resolution)
    const mimeType = stringValue(record.type)
    return [{
      url: record.url,
      mimeType,
      container: stringValue(record.container) ?? inferContainer(mimeType),
      width: dimensions?.width,
      height: dimensions?.height ?? parseHeight(stringValue(record.qualityLabel) ?? stringValue(record.quality)),
      bitrate: parseFiniteNumber(record.bitrate),
      videoCodec: stringValue(record.encoding),
      videoOnly: false,
      audioOnly: false,
      qualityLabel: stringValue(record.qualityLabel) ?? stringValue(record.quality),
      proxied: isInstanceProxy(record.url, instanceHost),
    } satisfies MediaStream]
  })
}

function isInstanceProxy(url: string, instanceHost: string): boolean {
  try {
    return new URL(url).host === instanceHost
  } catch {
    return false
  }
}

function parseResolution(value?: string): { width: number; height: number } | undefined {
  const match = value?.match(/^(\d{2,5})x(\d{2,5})$/)
  if (!match) return undefined
  return { width: Number(match[1]), height: Number(match[2]) }
}

function parseHeight(value?: string): number | undefined {
  const match = value?.match(/(\d{3,4})p/i)
  return match ? Number(match[1]) : undefined
}

function inferContainer(mimeType?: string): string | undefined {
  if (mimeType?.includes('/mp4')) return 'mp4'
  if (mimeType?.includes('/webm')) return 'webm'
  return undefined
}

function earliestExpiry(streams: readonly MediaStream[]): number | undefined {
  const values = streams.flatMap((stream) => {
    try {
      const raw = new URL(stream.url).searchParams.get('expire')
      const seconds = raw ? Number(raw) : Number.NaN
      return Number.isFinite(seconds) ? [seconds * 1000] : []
    } catch {
      return []
    }
  })
  return values.length ? Math.min(...values) : undefined
}

function normalizeInstance(instance: string): string {
  const url = new URL(instance)
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new MediaResolverError('INVALID_RESPONSE', 'Invalid Invidious instance URL')
  return url.toString().replace(/\/$/, '')
}

function parseFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}
