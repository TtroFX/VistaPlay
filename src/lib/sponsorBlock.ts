export interface SponsorSegment { segment: [number, number]; category: string; actionType?: string; UUID?: string }

export async function fetchSponsorSegments(videoId: string, signal?: AbortSignal): Promise<SponsorSegment[]> {
  const url = new URL('https://sponsor.ajay.app/api/skipSegments')
  url.searchParams.set('videoID', videoId)
  url.searchParams.set('categories', JSON.stringify(['sponsor', 'selfpromo', 'interaction', 'intro', 'outro']))
  const response = await fetch(url, { signal })
  if (response.status === 404) return []
  if (!response.ok) throw new Error(`SponsorBlock ${response.status}`)
  return await response.json() as SponsorSegment[]
}
