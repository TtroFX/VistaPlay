import { once } from 'node:events'
import { isValidVideoId, parseItag, resolveProgressiveFormat } from '../lib/youtube.js'

const MAX_RANGE_BYTES = 4 * 1024 * 1024
const FORWARDED_HEADERS = ['accept-ranges', 'content-length', 'content-range', 'content-type', 'etag', 'last-modified']

export default async function handler(request, response) {
  applyCors(response)

  if (request.method === 'OPTIONS') {
    response.status(204).end()
    return
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.status(405).json({ error: 'METHOD_NOT_ALLOWED' })
    return
  }

  const videoId = queryValue(request, 'videoId')
  const itag = parseItag(queryValue(request, 'itag'))
  if (!isValidVideoId(videoId) || itag === undefined) {
    response.status(400).json({ error: 'INVALID_MEDIA_REQUEST' })
    return
  }

  const controller = new AbortController()
  request.on?.('close', () => controller.abort())

  try {
    const format = await resolveProgressiveFormat(videoId, itag)
    const upstreamRange = boundedRange(headerValue(request.headers, 'range'))
    const upstream = await fetch(format.url, {
      method: request.method === 'HEAD' ? 'HEAD' : 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        Accept: '*/*',
        'Accept-Encoding': 'identity',
        Range: upstreamRange,
        'User-Agent': 'Mozilla/5.0 (compatible; VistaPlayMediaRelay/1.0)',
      },
    })

    if (!upstream.ok && upstream.status !== 206) {
      const detail = await upstream.text().catch(() => '')
      response.status(upstream.status || 502).json({
        error: 'UPSTREAM_MEDIA_FAILED',
        detail: detail.slice(0, 240),
      })
      return
    }

    response.statusCode = upstream.status
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('Vary', 'Range')
    for (const name of FORWARDED_HEADERS) {
      const value = upstream.headers.get(name)
      if (value) response.setHeader(name, value)
    }
    if (!upstream.headers.get('accept-ranges')) response.setHeader('Accept-Ranges', 'bytes')

    if (request.method === 'HEAD' || !upstream.body) {
      response.end()
      return
    }

    const reader = upstream.body.getReader()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (!response.write(Buffer.from(value))) await once(response, 'drain')
      }
      response.end()
    } finally {
      reader.releaseLock()
    }
  } catch (error) {
    if (controller.signal.aborted) return
    if (!response.headersSent) {
      response.status(502).json({
        error: 'MEDIA_RELAY_FAILED',
        detail: error instanceof Error ? error.message : String(error),
      })
    } else {
      response.destroy?.(error instanceof Error ? error : undefined)
    }
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

function headerValue(headers, name) {
  if (!headers) return undefined
  if (typeof headers.get === 'function') return headers.get(name) ?? undefined
  const value = headers[name] ?? headers[name.toLowerCase()]
  return Array.isArray(value) ? value[0] : typeof value === 'string' ? value : undefined
}

function applyCors(response) {
  response.setHeader('Access-Control-Allow-Origin', '*')
  response.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
  response.setHeader('Access-Control-Allow-Headers', 'Accept, Range, Content-Type')
  response.setHeader('Access-Control-Expose-Headers', 'Accept-Ranges, Content-Length, Content-Range, Content-Type')
  response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
}
