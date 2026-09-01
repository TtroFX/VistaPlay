import type { ResolvedMedia } from '../types'

interface CacheEntry {
  media: ResolvedMedia
  expiresAt: number
}

export class ResolutionCache {
  private entries = new Map<string, CacheEntry>()

  constructor(private readonly ttlMs = 5 * 60 * 1000) {}

  get(videoId: string, now = Date.now()): ResolvedMedia | undefined {
    const entry = this.entries.get(videoId)
    if (!entry) return undefined
    if (entry.expiresAt <= now) {
      this.entries.delete(videoId)
      return undefined
    }
    return entry.media
  }

  set(media: ResolvedMedia, now = Date.now()): void {
    const ttlExpiry = now + this.ttlMs
    const expiresAt = media.expiresAt ? Math.min(media.expiresAt, ttlExpiry) : ttlExpiry
    if (expiresAt <= now) return
    this.entries.set(media.videoId, { media, expiresAt })
  }

  invalidate(videoId: string): void {
    this.entries.delete(videoId)
  }

  clear(): void {
    this.entries.clear()
  }
}
