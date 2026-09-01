import { Innertube } from 'youtubei.js/cf-worker'

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/
const ITAG_PATTERN = /^\d{1,5}$/
const FORMAT_CACHE_TTL_MS = 90_000
const MAX_CACHE_ENTRIES = 96
const MAX_RANGE_BYTES = 4 * 1024 * 1024

let innertubePromise
const formatCache = new Map()

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() })

    const url = new URL(request.url)
    if (url.pathname === '/health') {
      return json({ ok: true, service: 'vistaplay-media-relay', runtime: 'cloudflare-worker' }, 200, {
        'Cache-Control': 'no-store',
      })
    }
    if (url.pathname === '/api/resolve') return handleResolve(request, url)
    if (url.pathname === '/api/media') return handleMedia(request, url)
    return json({ error: 'NOT_FOUND' }, 404)
  },
}

async function handleResolve(request, url) {
  if (request.method !== 'GET') return json({ error: 'METHOD_NOT_ALLOWED' }, 405)
  const videoId = url.searchParams.get('videoId') ?? ''
  if (!isValidVideoId(videoId)) return json({ error: 'INVALID_VIDEO_ID' }, 400)

  try {
    const format = await resolveProgressiveFormat(videoId)
    const origin = url.origin
    const mediaUrl = new URL('/api/media', origin)
    mediaUrl.searchParams.set('videoId', videoId)
    mediaUrl.searchParams.set('itag', String(format.itag))

    return json({
      provider: 'youtube',
      videoId,
      streams: [describeFormat(format, mediaUrl.toString())],
      resolvedAt: Date.now(),
      resolver: { type: 'custom', instance: origin },
    }, 200, {
      'Cache-Control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=120',
    })
  } catch (error) {
    return json({
      error: 'RESOLVE_FAILED',
      detail: error instanceof Error ? error.message : String(error),
    }, 502)
  }
}

async function handleMedia(request, url) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return json({ error: 'METHOD_NOT_ALLOWED' }, 405)

  const videoId = url.searchParams.get('videoId') ?? ''
  const itag = parseItag(url.searchParams.get('itag'))
  if (!isValidVideoId(videoId) || itag === undefined) return json({ error: 'INVALID_MEDIA_REQUEST' }, 400)

  try {
    const format = await resolveProgressiveFormat(videoId, itag)
    const range = boundedRange(request.headers.get('Range'))
    const upstream = await fetch(format.url, {
      method: request.method,
      redirect: 'follow',
      headers: {
        Accept: '*/*',
        'Accept-Encoding': 'identity',
        Range: range,
      },
    })

    if (!upstream.ok && upstream.status !== 206) {
      const detail = await upstream.text().catch(() => '')
      return json({ error: 'UPSTREAM_MEDIA_FAILED', detail: detail.slice(0, 240) }, upstream.status || 502)
    }

    const headers = corsHeaders()
    headers.set('Cache-Control', 'no-store')
    headers.set('Vary', 'Range')
    for (const name of ['accept-ranges', 'content-length', 'content-range', 'content-type', 'etag', 'last-modified']) {
      const value = upstream.headers.get(name)
      if (value) headers.set(name, value)
    }
    if (!headers.has('accept-ranges')) headers.set('Accept-Ranges', 'bytes')

    return new Response(request.method === 'HEAD' ? null : upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    })
  } catch (error) {
    return json({
      error: 'MEDIA_RELAY_FAILED',
      detail: error instanceof Error ? error.message : String(error),
    }, 502)
  }
}

async function resolveProgressiveFormat(videoId, requestedItag) {
  const cacheKey = `${videoId}:${requestedItag ?? 'best'}`
  const cached = formatCache.get(cacheKey)
  if (cached?.expiresAt > Date.now()) return cached.format
  if (cached) formatCache.delete(cacheKey)

  const youtube = await getInnertube()
  const options = requestedItag === undefined
    ? { type: 'video+audio', quality: 'best', format: 'mp4' }
    : { itag: requestedItag }
  const format = await youtube.getStreamingData(videoId, options)

  if (!format || !Number.isFinite(Number(format.itag)) || typeof format.url !== 'string') {
    throw new Error('NO_PLAYABLE_STREAM')
  }
  const hasAudio = format.has_audio ?? format.hasAudio
  const hasVideo = format.has_video ?? format.hasVideo
  if (hasAudio === false || hasVideo === false) throw new Error('NO_PROGRESSIVE_STREAM')

  const expiresAt = Math.min(parseExpiry(format.url) ?? Date.now() + FORMAT_CACHE_TTL_MS, Date.now() + FORMAT_CACHE_TTL_MS)
  formatCache.set(cacheKey, { format, expiresAt })
  if (formatCache.size > MAX_CACHE_ENTRIES) formatCache.delete(formatCache.keys().next().value)
  return format
}

async function getInnertube() {
  if (!innertubePromise) {
    innertubePromise = Innertube.create().catch((error) => {
      innertubePromise = undefined
      throw error
    })
  }
  return innertubePromise
}

function describeFormat(format, relayUrl) {
  const mimeType = stringValue(format.mime_type ?? format.mimeType) ?? 'video/mp4'
  return {
    url: relayUrl,
    mimeType,
    container: stringValue(format.container) ?? inferContainer(mimeType),
    width: finiteNumber(format.width),
    height: finiteNumber(format.height),
    fps: finiteNumber(format.fps),
    bitrate: finiteNumber(format.bitrate),
    videoCodec: stringValue(format.video_codec ?? format.videoCodec),
    audioCodec: stringValue(format.audio_codec ?? format.audioCodec),
    videoOnly: false,
    audioOnly: false,
    qualityLabel: stringValue(format.quality_label ?? format.qualityLabel ?? format.quality),
    proxied: true,
  }
}

export function boundedRange(value) {
  if (typeof value !== 'string') return `bytes=0-${MAX_RANGE_BYTES - 1}`
  const match = value.trim().match(/^bytes=(\d+)-(\d*)$/)
  if (!match) return `bytes=0-${MAX_RANGE_BYTES - 1}`
  const start = Number(match[1])
  if (!Number.isSafeInteger(start) || start < 0) return `bytes=0-${MAX_RANGE_BYTES - 1}`
  const requestedEnd = match[2] ? Number(match[2]) : start + MAX_RANGE_BYTES - 1
  const end = Number.isSafeInteger(requestedEnd)
    ? Math.min(requestedEnd, start + MAX_RANGE_BYTES - 1)
    : start + MAX_RANGE_BYTES - 1
  return `bytes=${start}-${Math.max(start, end)}`
}

function isValidVideoId(value) {
  return VIDEO_ID_PATTERN.test(value)
}

function parseItag(value) {
  if (typeof value !== 'string' || !ITAG_PATTERN.test(value)) return undefined
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : undefined
}

function parseExpiry(value) {
  try {
    const raw = new URL(value).searchParams.get('expire')
    const seconds = raw ? Number(raw) : Number.NaN
    return Number.isFinite(seconds) ? seconds * 1000 : undefined
  } catch {
    return undefined
  }
}

function json(body, status = 200, extraHeaders = {}) {
  const headers = corsHeaders()
  headers.set('Content-Type', 'application/json; charset=utf-8')
  for (const [name, value] of Object.entries(extraHeaders)) headers.set(name, value)
  return new Response(JSON.stringify(body), { status, headers })
}

function corsHeaders() {
  return new Headers({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Accept, Range, Content-Type',
    'Access-Control-Expose-Headers': 'Accept-Ranges, Content-Length, Content-Range, Content-Type',
    'Cross-Origin-Resource-Policy': 'cross-origin',
  })
}

function inferContainer(mimeType) {
  if (mimeType.includes('/mp4')) return 'mp4'
  if (mimeType.includes('/webm')) return 'webm'
  return undefined
}

function finiteNumber(value) {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : undefined
}

function stringValue(value) {
  return typeof value === 'string' && value ? value : undefined
}
