import { MediaResolverError } from '../MediaResolver'
import type { MediaStream } from '../types'

export type CanPlayType = (mimeType: string) => boolean

export function selectInitialStream(streams: readonly MediaStream[], canPlayType: CanPlayType = browserCanPlayType): MediaStream {
  const candidates = streams.filter((stream) => !stream.videoOnly && !stream.audioOnly && isValidHttpUrl(stream.url))
    .filter((stream) => !stream.mimeType || canPlayType(stream.mimeType))

  if (!candidates.length) throw new MediaResolverError('NO_PLAYABLE_STREAM', 'No playable muxed stream is available')

  return [...candidates].sort((a, b) => scoreStream(b) - scoreStream(a))[0]
}

function scoreStream(stream: MediaStream): number {
  let score = 0
  if (stream.proxied) score += 100_000
  if (stream.container?.toLowerCase() === 'mp4' || stream.mimeType?.toLowerCase().includes('video/mp4')) score += 20_000
  const height = stream.height ?? parseHeight(stream.qualityLabel)
  if (height !== undefined) {
    if (height <= 720) score += 10_000 + height * 10
    else score += Math.max(0, 5000 - (height - 720) * 10)
  }
  if (stream.bitrate !== undefined && stream.bitrate > 0) score += Math.min(3000, Math.round(stream.bitrate / 100_000))
  return score
}

function parseHeight(label?: string): number | undefined {
  const match = label?.match(/(\d{3,4})p/i)
  return match ? Number(match[1]) : undefined
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

function browserCanPlayType(mimeType: string): boolean {
  if (typeof document === 'undefined') return true
  return document.createElement('video').canPlayType(mimeType) !== ''
}
