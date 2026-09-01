import { Innertube } from 'youtubei.js'

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/
const ITAG_PATTERN = /^\d{1,5}$/
const FORMAT_CACHE_TTL_MS = 90_000
const MAX_CACHE_ENTRIES = 96

let innertubePromise
const formatCache = new Map()

export function isValidVideoId(value) {
  return typeof value === 'string' && VIDEO_ID_PATTERN.test(value)
}

export function parseItag(value) {
  const raw = Array.isArray(value) ? value[0] : value
  if (typeof raw !== 'string' || !ITAG_PATTERN.test(raw)) return undefined
  const parsed = Number(raw)
  return Number.isSafeInteger(parsed) ? parsed : undefined
}

export async function resolveProgressiveFormat(videoId, requestedItag) {
  if (!isValidVideoId(videoId)) throw new Error('INVALID_VIDEO_ID')
  const key = `${videoId}:${requestedItag ?? 'best'}`
  const cached = formatCache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.format
  if (cached) formatCache.delete(key)

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
  formatCache.set(key, { format, expiresAt })
  if (formatCache.size > MAX_CACHE_ENTRIES) formatCache.delete(formatCache.keys().next().value)
  return format
}

export function describeFormat(format, relayUrl) {
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

export function requestOrigin(request) {
  const forwardedHost = headerValue(request?.headers, 'x-forwarded-host')
  const host = forwardedHost ?? headerValue(request?.headers, 'host')
  if (!host) throw new Error('MISSING_HOST')
  const forwardedProto = headerValue(request?.headers, 'x-forwarded-proto')
  const proto = forwardedProto === 'http' ? 'http' : 'https'
  return `${proto}://${host}`
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

function headerValue(headers, name) {
  if (!headers) return undefined
  if (typeof headers.get === 'function') return headers.get(name) ?? undefined
  const value = headers[name] ?? headers[name.toLowerCase()]
  return Array.isArray(value) ? value[0] : typeof value === 'string' ? value : undefined
}

function parseExpiry(url) {
  try {
    const raw = new URL(url).searchParams.get('expire')
    const seconds = raw ? Number(raw) : Number.NaN
    return Number.isFinite(seconds) ? seconds * 1000 : undefined
  } catch {
    return undefined
  }
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
