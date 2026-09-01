import { MediaResolverError, type MediaResolver } from '../MediaResolver'
import type { MediaStream, ResolvedMedia } from '../types'

interface PipedStreamRecord {
  url?: unknown
  mimeType?: unknown
  format?: unknown
  quality?: unknown
  codec?: unknown
  bitrate?: unknown
  width?: unknown
  height?: unknown
  fps?: unknown
  videoOnly?: unknown
}

export class PipedResolver implements MediaResolver {
  readonly id: string
  readonly instance: string

  constructor(instance: string) {
    this.instance = normalizeInstance(instance)
    this.id = `piped:${new URL(this.instance).host}`
  }

  async resolve(videoId: string, signal?: AbortSignal): Promise<ResolvedMedia> {
    const response = await fetch(`${this.instance}/streams/${encodeURIComponent(videoId)}`, {
      signal,
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) throw new MediaResolverError('RESOLVE_FAILED', `Piped ${response.status} ${response.statusText}`)
    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      throw new MediaResolverError('INVALID_RESPONSE', 'Piped returned invalid JSON')
    }
    return normalizePipedResponse(videoId, this.instance, payload)
  }
}

export function normalizePipedResponse(videoId: string, instance: string, payload: unknown): ResolvedMedia {
  if (!isRecord(payload)) throw new MediaResolverError('INVALID_RESPONSE', 'Piped response is not an object')
  const proxyUrl = typeof payload.proxyUrl === 'string' ? payload.proxyUrl : undefined
  const streams = [
    ...normalizeStreams(payload.videoStreams, false, proxyUrl),
    ...normalizeStreams(payload.audioStreams, true, proxyUrl),
  ]
  if (!streams.length) throw new MediaResolverError('NO_PLAYABLE_STREAM', 'Piped returned no media streams')
  const expiresAt = earliestExpiry(streams)
  return {
    provider: 'youtube',
    videoId,
    duration: finiteNumber(payload.duration),
    streams,
    resolvedAt: Date.now(),
    expiresAt,
    resolver: { type: 'piped', instance: normalizeInstance(instance) },
  }
}

function normalizeStreams(value: unknown, audioOnly: boolean, proxyUrl?: string): MediaStream[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((raw) => {
    if (!isRecord(raw)) return []
    const record = raw as PipedStreamRecord
    if (typeof record.url !== 'string' || !isHttpUrl(record.url)) return []
    const videoOnly = audioOnly ? false : record.videoOnly === true
    return [{
      url: record.url,
      mimeType: stringValue(record.mimeType),
      container: normalizeContainer(stringValue(record.format), stringValue(record.mimeType)),
      width: finiteNumber(record.width),
      height: finiteNumber(record.height),
      fps: finiteNumber(record.fps),
      bitrate: finiteNumber(record.bitrate),
      videoCodec: audioOnly ? undefined : stringValue(record.codec),
      audioCodec: audioOnly ? stringValue(record.codec) : undefined,
      videoOnly,
      audioOnly,
      qualityLabel: stringValue(record.quality),
      proxied: isProxied(record.url, proxyUrl),
    } satisfies MediaStream]
  })
}

function isProxied(url: string, proxyUrl?: string): boolean {
  if (proxyUrl && url.startsWith(proxyUrl)) return true
  try {
    return !new URL(url).hostname.endsWith('googlevideo.com')
  } catch {
    return false
  }
}

function earliestExpiry(streams: readonly MediaStream[]): number | undefined {
  const expiries = streams.flatMap((stream) => {
    try {
      const value = new URL(stream.url).searchParams.get('expire')
      const seconds = value ? Number(value) : Number.NaN
      return Number.isFinite(seconds) ? [seconds * 1000] : []
    } catch {
      return []
    }
  })
  return expiries.length ? Math.min(...expiries) : undefined
}

function normalizeContainer(format?: string, mimeType?: string): string | undefined {
  const normalized = format?.toLowerCase()
  if (normalized === 'mpeg_4' || normalized === 'm4a') return 'mp4'
  if (normalized === 'webm') return 'webm'
  if (mimeType?.includes('/mp4')) return 'mp4'
  if (mimeType?.includes('/webm')) return 'webm'
  return normalized
}

function normalizeInstance(instance: string): string {
  const url = new URL(instance)
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new MediaResolverError('INVALID_RESPONSE', 'Invalid Piped instance URL')
  return url.toString().replace(/\/$/, '')
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
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
