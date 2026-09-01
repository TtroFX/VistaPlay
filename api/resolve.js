const INVIDIOUS_INSTANCES = [
  'https://inv.nadeko.net',
  'https://yt.chocolatemoo53.com',
  'https://invidious.tiekoetter.com',
  'https://invidious.f5.si',
]

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/
const RESOLVE_TIMEOUT_MS = 4_500

export default async function handler(request, response) {
  response.setHeader('Access-Control-Allow-Origin', '*')
  response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  response.setHeader('Access-Control-Allow-Headers', 'Accept, Content-Type')
  response.setHeader('Vary', 'Origin')

  if (request.method === 'OPTIONS') {
    response.status(204).end()
    return
  }
  if (request.method !== 'GET') {
    response.status(405).json({ error: 'METHOD_NOT_ALLOWED' })
    return
  }

  const videoId = getVideoId(request)
  if (!videoId || !VIDEO_ID_PATTERN.test(videoId)) {
    response.status(400).json({ error: 'INVALID_VIDEO_ID' })
    return
  }

  try {
    const media = await Promise.any(INVIDIOUS_INSTANCES.map((instance) => resolveFromInstance(instance, videoId)))
    response.setHeader('Cache-Control', 'public, max-age=30, s-maxage=60, stale-while-revalidate=120')
    response.status(200).json(media)
  } catch (error) {
    const details = error instanceof AggregateError
      ? error.errors.map((entry) => messageOf(entry)).slice(0, INVIDIOUS_INSTANCES.length)
      : [messageOf(error)]
    response.status(502).json({ error: 'NO_RESOLVER_AVAILABLE', details })
  }
}

function getVideoId(request) {
  const queryValue = request.query?.videoId
  if (Array.isArray(queryValue)) return queryValue[0]
  if (typeof queryValue === 'string') return queryValue
  try {
    return new URL(request.url, 'http://localhost').searchParams.get('videoId') ?? undefined
  } catch {
    return undefined
  }
}

async function resolveFromInstance(instance, videoId) {
  const endpoint = new URL(`/api/v1/videos/${encodeURIComponent(videoId)}`, `${instance}/`)
  endpoint.searchParams.set('local', 'true')

  const response = await fetch(endpoint, {
    headers: { Accept: 'application/json', 'User-Agent': 'VistaPlay-Resolver/1.0' },
    signal: AbortSignal.timeout(RESOLVE_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`${new URL(instance).host}: HTTP ${response.status}`)

  const payload = await response.json()
  const streams = normalizeProxyStreams(payload?.formatStreams, instance)
  if (!streams.length) throw new Error(`${new URL(instance).host}: no proxied muxed streams`)

  return {
    provider: 'youtube',
    videoId,
    duration: finiteNumber(payload?.lengthSeconds),
    streams,
    resolvedAt: Date.now(),
    expiresAt: earliestExpiry(streams),
    resolver: { type: 'invidious', instance },
  }
}

function normalizeProxyStreams(value, instance) {
  if (!Array.isArray(value)) return []
  const instanceUrl = new URL(instance)

  return value.flatMap((record) => {
    if (!record || typeof record !== 'object' || typeof record.url !== 'string') return []
    let streamUrl
    try {
      streamUrl = new URL(record.url, `${instance}/`)
    } catch {
      return []
    }

    if (!['http:', 'https:'].includes(streamUrl.protocol) || streamUrl.host !== instanceUrl.host) return []
    const mimeType = stringValue(record.type)
    const resolution = parseResolution(stringValue(record.resolution))
    return [{
      url: streamUrl.toString(),
      mimeType,
      container: stringValue(record.container) ?? inferContainer(mimeType),
      width: resolution?.width,
      height: resolution?.height ?? parseHeight(stringValue(record.qualityLabel) ?? stringValue(record.quality)),
      bitrate: finiteNumber(record.bitrate),
      videoCodec: stringValue(record.encoding),
      videoOnly: false,
      audioOnly: false,
      qualityLabel: stringValue(record.qualityLabel) ?? stringValue(record.quality),
      proxied: true,
    }]
  })
}

function parseResolution(value) {
  const match = value?.match(/^(\d{2,5})x(\d{2,5})$/)
  return match ? { width: Number(match[1]), height: Number(match[2]) } : undefined
}

function parseHeight(value) {
  const match = value?.match(/(\d{3,4})p/i)
  return match ? Number(match[1]) : undefined
}

function inferContainer(mimeType) {
  if (mimeType?.includes('/mp4')) return 'mp4'
  if (mimeType?.includes('/webm')) return 'webm'
  return undefined
}

function finiteNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function stringValue(value) {
  return typeof value === 'string' && value ? value : undefined
}

function earliestExpiry(streams) {
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

function messageOf(value) {
  return value instanceof Error ? value.message : String(value)
}
