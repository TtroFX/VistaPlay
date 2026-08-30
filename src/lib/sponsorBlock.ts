import { cacheGet, cachePut } from '../data/db'
import { recordDiagnostic } from './diagnostics'

export interface SponsorSegment { segment: [number, number]; category: string; actionType?: string; UUID?: string }

const SPONSOR_TTL = 24 * 60 * 60 * 1000

async function storeSegments(key: string, value: SponsorSegment[]): Promise<void> {
  try {
    await cachePut(key, value, SPONSOR_TTL)
  } catch {
    recordDiagnostic('runtime', 'Sponsor segment cache write failed; remote result remains available')
  }
}

export async function fetchSponsorSegments(videoId: string, signal?: AbortSignal): Promise<SponsorSegment[]> {
  const cacheKey = `sponsor:${videoId}`
  const cached = await cacheGet<SponsorSegment[]>(cacheKey)
  if (cached) return cached.value
  const url = new URL('https://sponsor.ajay.app/api/skipSegments')
  url.searchParams.set('videoID', videoId)
  url.searchParams.set('categories', JSON.stringify(['sponsor', 'selfpromo', 'interaction', 'intro', 'outro']))
  const response = await fetch(url, { signal })
  if (response.status === 404) { await storeSegments(cacheKey, []); return [] }
  if (!response.ok) throw new Error(`SponsorBlock ${response.status}`)
  const value = await response.json() as SponsorSegment[]
  await storeSegments(cacheKey, value)
  return value
}
