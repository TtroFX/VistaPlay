import { describeFormat, isValidVideoId, requestOrigin, resolveProgressiveFormat } from '../lib/youtube.js'

export default async function handler(request, response) {
  applyCors(response)

  if (request.method === 'OPTIONS') {
    response.status(204).end()
    return
  }
  if (request.method !== 'GET') {
    response.status(405).json({ error: 'METHOD_NOT_ALLOWED' })
    return
  }

  const videoId = queryValue(request, 'videoId')
  if (!isValidVideoId(videoId)) {
    response.status(400).json({ error: 'INVALID_VIDEO_ID' })
    return
  }

  try {
    const format = await resolveProgressiveFormat(videoId)
    const itag = Number(format.itag)
    const origin = requestOrigin(request)
    const mediaUrl = new URL('/api/media', `${origin}/`)
    mediaUrl.searchParams.set('videoId', videoId)
    mediaUrl.searchParams.set('itag', String(itag))

    response.setHeader('Cache-Control', 'public, max-age=30, s-maxage=60, stale-while-revalidate=120')
    response.status(200).json({
      provider: 'youtube',
      videoId,
      streams: [describeFormat(format, mediaUrl.toString())],
      resolvedAt: Date.now(),
      resolver: { type: 'custom', instance: origin },
    })
  } catch (error) {
    response.status(502).json({
      error: 'RESOLVE_FAILED',
      detail: error instanceof Error ? error.message : String(error),
    })
  }
}

function queryValue(request, key) {
  const value = request.query?.[key]
  if (Array.isArray(value)) return value[0]
  if (typeof value === 'string') return value
  try {
    return new URL(request.url, 'http://localhost').searchParams.get(key) ?? undefined
  } catch {
    return undefined
  }
}

function applyCors(response) {
  response.setHeader('Access-Control-Allow-Origin', '*')
  response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  response.setHeader('Access-Control-Allow-Headers', 'Accept, Range, Content-Type')
  response.setHeader('Access-Control-Expose-Headers', 'Accept-Ranges, Content-Length, Content-Range, Content-Type')
  response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
}
