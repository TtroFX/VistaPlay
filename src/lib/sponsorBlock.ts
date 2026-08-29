import { cacheGet, cachePut } from '../data/db'

export interface SponsorSegment { segment: [number, number]; category: string; actionType?: string; UUID?: string }

const SPONSOR_TTL = 24 * 60 * 60 * 1000

export async function fetchSponsorSegments(videoId: string, signal?: AbortSignal): Promise<SponsorSegment[]> {
  const cacheKey = `sponsor:${videoId}`
  const cached = await cacheGet<SponsorSegment[]>(cacheKey)
  if (cached) return cached.value
  const url = new URL('https://sponsor.ajay.app/api/skipSegments')
  url.searchParams.set('videoID', videoId)
  url.searchParams.set('categories', JSON.stringify(['sponsor', 'selfpromo', 'interaction', 'intro', 'outro']))
  const response = await fetch(url, { signal })
  if (response.status === 404) { await cachePut(cacheKey, [], SPONSOR_TTL); return [] }
  if (!response.ok) throw new Error(`SponsorBlock ${response.status}`)
  const value = await response.json() as SponsorSegment[]
  await cachePut(cacheKey, value, SPONSOR_TTL)
  return value
}
