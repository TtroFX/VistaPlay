import type { SearchFilters, SearchResult, VideoRef } from '../domain/types'
import { cacheGet, cachePut } from '../data/db'
import { recordDiagnostic } from './diagnostics'

const API = 'https://www.googleapis.com/youtube/v3'
const SEARCH_TTL = 6 * 60 * 60 * 1000
const METADATA_TTL = 24 * 60 * 60 * 1000
const LIVE_METADATA_TTL = 60 * 1000
const COMMENTS_TTL = 10 * 60 * 1000

export class CapabilityError extends Error {
  constructor(public readonly capability: string, message: string) { super(message) }
}

export function parseDuration(value?: string): number | undefined {
  if (!value) return undefined
  const m = value.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/)
  if (!m) return undefined
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)
}

export function parseYouTubeInput(value: string): { type: 'video' | 'channel' | 'playlist'; id: string } | undefined {
  const trimmed = value.trim()
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return { type: 'video', id: trimmed }
  const embeddedUrls = trimmed.match(/https?:\/\/[^\s]+/g) ?? []
  for (const candidate of [trimmed, ...embeddedUrls]) {
    try {
      const cleaned = candidate.replace(/[),.;!?]+$/, '')
      const url = new URL(cleaned.startsWith('http') ? cleaned : `https://${cleaned}`)
      if (!/(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(url.hostname)) continue
      if (url.hostname.endsWith('youtu.be')) {
        const id = url.pathname.split('/').filter(Boolean)[0]
        if (id && /^[A-Za-z0-9_-]{11}$/.test(id)) return { type: 'video', id }
        continue
      }
      const video = url.searchParams.get('v')
      if (video && /^[A-Za-z0-9_-]{11}$/.test(video)) return { type: 'video', id: video }
      const playlist = url.searchParams.get('list')
      if (playlist) return { type: 'playlist', id: playlist }
      const channel = url.pathname.match(/^\/channel\/([^/]+)/)?.[1]
      if (channel) return { type: 'channel', id: channel }
    } catch { /* Try the next URL candidate. */ }
  }
  return undefined
}

export function parseYouTubeVideoId(value: string): string | undefined {
  const parsed = parseYouTubeInput(value)
  return parsed?.type === 'video' ? parsed.id : undefined
}

async function apiFetch<T>(path: string, params: Record<string, string>, signal?: AbortSignal, accessToken?: string): Promise<T> {
  const key = import.meta.env.VITE_YOUTUBE_API_KEY
  if (!key && !accessToken) throw new CapabilityError('youtube-api', 'YouTube Data API key is not configured. Direct video URLs remain available.')
  const url = new URL(`${API}/${path}`)
  Object.entries(params).forEach(([name, value]) => url.searchParams.set(name, value))
  if (!accessToken && key) url.searchParams.set('key', key)
  let lastError: Error | undefined
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, { signal, headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined })
      if (response.ok) return await response.json() as T
      const body = await response.text()
      if (response.status !== 429 && response.status < 500) throw new Error(`YouTube API ${response.status}: ${body.slice(0, 240)}`)
      lastError = new Error(`YouTube API ${response.status}`)
    } catch (error) {
      if (signal?.aborted) throw error
      lastError = error instanceof Error ? error : new Error('YouTube request failed')
    }
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 300 * 2 ** attempt + Math.random() * 180))
  }
  recordDiagnostic('api', `YouTube ${path} request failed after retries`)
  throw lastError ?? new Error('YouTube request failed')
}

interface VideoApiItem {
  id: string
  snippet?: { title?: string; channelId?: string; channelTitle?: string; description?: string; publishedAt?: string; thumbnails?: { medium?: { url: string }; high?: { url: string } }; tags?: string[]; liveBroadcastContent?: string; categoryId?: string }
  contentDetails?: { duration?: string }
  statistics?: { viewCount?: string }
  liveStreamingDetails?: { actualEndTime?: string; scheduledStartTime?: string; activeLiveChatId?: string }
}

function mapVideo(item: VideoApiItem): VideoRef {
  const live = item.snippet?.liveBroadcastContent
  return {
    videoId: item.id, title: item.snippet?.title ?? `Video ${item.id}`, channelId: item.snippet?.channelId,
    channelTitle: item.snippet?.channelTitle, description: item.snippet?.description,
    thumbnail: item.snippet?.thumbnails?.high?.url ?? item.snippet?.thumbnails?.medium?.url ?? `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`,
    durationSeconds: parseDuration(item.contentDetails?.duration), publishedAt: item.snippet?.publishedAt,
    viewCount: item.statistics?.viewCount ? Number(item.statistics.viewCount) : undefined, categoryId: item.snippet?.categoryId,
    tags: item.snippet?.tags, liveStatus: live === 'live' ? 'live' : live === 'upcoming' ? 'upcoming' : item.liveStreamingDetails?.actualEndTime ? 'ended' : 'none', available: true
  }
}

export async function verifyVideoIds(ids: string[], signal?: AbortSignal, accessToken?: string): Promise<{ valid: VideoRef[]; invalid: string[] }> {
  const unique = [...new Set(ids)].slice(0, 50)
  if (!unique.length) return { valid: [], invalid: [] }
  const cached = await Promise.all(unique.map(async (id) => (await cacheGet<VideoRef>(`video:${id}`))?.value))
  const metadata = new Map(cached.filter(Boolean).map((video) => [video!.videoId, video!]))
  const missing = unique.filter((id) => !metadata.has(id))
  if (missing.length) {
    const data = await apiFetch<{ items?: VideoApiItem[] }>('videos', { part: 'snippet,contentDetails,statistics,liveStreamingDetails', id: missing.join(',') }, signal, accessToken)
    for (const item of (data.items ?? []).map(mapVideo)) {
      metadata.set(item.videoId, item)
      await cachePut(`video:${item.videoId}`, item, item.liveStatus === 'live' || item.liveStatus === 'upcoming' ? LIVE_METADATA_TTL : METADATA_TTL)
    }
  }
  const valid = unique.map((id) => metadata.get(id)).filter(Boolean) as VideoRef[]
  const found = new Set(valid.map((item) => item.videoId))
  return { valid, invalid: unique.filter((id) => !found.has(id)) }
}

export async function fetchSubscriptionChannelIds(accessToken: string, signal?: AbortSignal): Promise<string[]> {
  const channels: string[] = []
  let pageToken: string | undefined
  do {
    const params: Record<string, string> = { part: 'snippet', mine: 'true', maxResults: '50' }
    if (pageToken) params.pageToken = pageToken
    const data = await apiFetch<{ items?: Array<{ snippet?: { resourceId?: { channelId?: string } } }>; nextPageToken?: string }>('subscriptions', params, signal, accessToken)
    channels.push(...(data.items ?? []).map((item) => item.snippet?.resourceId?.channelId).filter(Boolean) as string[])
    pageToken = data.nextPageToken
  } while (pageToken && channels.length < 100)
  return [...new Set(channels)].slice(0, 100)
}

export async function fetchLatestUploads(channelIds: string[], accessToken?: string, signal?: AbortSignal): Promise<VideoRef[]> {
  const uniqueChannels = [...new Set(channelIds)].filter(Boolean).slice(0, 25)
  if (!uniqueChannels.length) return []
  const channels = await apiFetch<{ items?: Array<{ contentDetails?: { relatedPlaylists?: { uploads?: string } } }> }>(
    'channels', { part: 'contentDetails', id: uniqueChannels.join(',') }, signal, accessToken,
  )
  const playlists = (channels.items ?? []).map((item) => item.contentDetails?.relatedPlaylists?.uploads).filter(Boolean) as string[]
  const videoIds: string[] = []
  for (let offset = 0; offset < playlists.length; offset += 5) {
    const batch = playlists.slice(offset, offset + 5)
    const pages = await Promise.all(batch.map((playlistId) => apiFetch<{ items?: Array<{ contentDetails?: { videoId?: string } }> }>(
      'playlistItems', { part: 'contentDetails', playlistId, maxResults: '3' }, signal, accessToken,
    )))
    for (const page of pages) videoIds.push(...(page.items ?? []).map((item) => item.contentDetails?.videoId).filter(Boolean) as string[])
  }
  const verified = await verifyVideoIds(videoIds, signal, accessToken)
  return verified.valid.sort((a, b) => Date.parse(b.publishedAt ?? '0') - Date.parse(a.publishedAt ?? '0'))
}

export async function searchRemote(query: string, filters: SearchFilters, pageToken?: string, signal?: AbortSignal): Promise<{ items: SearchResult[]; nextPageToken?: string }> {
  const cacheKey = `search:${JSON.stringify({ query, filters, pageToken })}`
  const cached = await cacheGet<{ items: SearchResult[]; nextPageToken?: string }>(cacheKey)
  if (cached) return cached.value
  const params: Record<string, string> = { part: 'snippet', q: query, type: filters.type, maxResults: '25', safeSearch: 'moderate' }
  if (pageToken) params.pageToken = pageToken
  if (filters.publishedAfter) params.publishedAfter = new Date(filters.publishedAfter).toISOString()
  if (filters.live !== 'any') params.eventType = filters.live
  if (filters.type === 'video' && filters.duration !== 'any') params.videoDuration = filters.duration
  const search = await apiFetch<{ items?: Array<{ id: { videoId?: string; channelId?: string; playlistId?: string }; snippet?: { title?: string; description?: string; channelId?: string; channelTitle?: string; thumbnails?: { medium?: { url: string } } } }>; nextPageToken?: string }>('search', params, signal)
  const ids = (search.items ?? []).map((item) => item.id.videoId).filter(Boolean) as string[]
  const verified = filters.type === 'video' ? await verifyVideoIds(ids, signal) : { valid: [], invalid: [] }
  const excludedChannels = new Set(filters.excludeChannels.map((value) => value.toLowerCase()))
  const excludedWords = filters.excludeKeywords.map((value) => value.toLowerCase()).filter(Boolean)
  let videos = verified.valid.filter((video) => !excludedChannels.has((video.channelId ?? '').toLowerCase()) && !excludedWords.some((word) => `${video.title} ${video.description ?? ''}`.toLowerCase().includes(word)))
  if (filters.shorts !== 'include') {
    videos = videos.filter((video) => {
      const likelyShort = /#shorts\b/i.test(`${video.title} ${video.description ?? ''}`) || (video.durationSeconds !== undefined && video.durationSeconds <= 60)
      return filters.shorts === 'only' ? likelyShort : !likelyShort
    })
  }
  const items: SearchResult[] = filters.type === 'video'
    ? videos.map((video) => ({ type: 'video', id: video.videoId, title: video.title, description: video.description, thumbnail: video.thumbnail, channelTitle: video.channelTitle, video }))
    : (search.items ?? []).map((item) => ({
        type: filters.type,
        id: filters.type === 'channel' ? item.id.channelId ?? '' : item.id.playlistId ?? '',
        title: item.snippet?.title ?? (filters.type === 'channel' ? 'Channel' : 'Playlist'),
        description: item.snippet?.description,
        thumbnail: item.snippet?.thumbnails?.medium?.url,
        channelId: filters.type === 'channel' ? item.id.channelId : item.snippet?.channelId,
        channelTitle: item.snippet?.channelTitle
      })).filter((item) => item.id && !excludedWords.some((word) => `${item.title} ${item.description ?? ''}`.toLowerCase().includes(word)))
  const value = { items, nextPageToken: search.nextPageToken }
  await cachePut(cacheKey, value, SEARCH_TTL)
  return value
}

export async function searchVideos(query: string, filters: SearchFilters, pageToken?: string, signal?: AbortSignal): Promise<{ items: VideoRef[]; nextPageToken?: string }> {
  const result = await searchRemote(query, { ...filters, type: 'video' }, pageToken, signal)
  return { items: result.items.map((item) => item.video).filter(Boolean) as VideoRef[], nextPageToken: result.nextPageToken }
}

export interface Chapter { title: string; start: number }
export function extractChapters(description: string, duration?: number): Chapter[] {
  const lines = description.split(/\r?\n/)
  const chapters: Chapter[] = []
  for (const line of lines) {
    const match = line.match(/(?:^|\s)(?:(\d+):)?(\d{1,2}):(\d{2})(?:\s+|\s*[-–—]\s*)(.+)$/)
    if (!match) continue
    const seconds = Number(match[1] ?? 0) * 3600 + Number(match[2]) * 60 + Number(match[3])
    if (Number(match[3]) > 59 || (duration !== undefined && seconds > duration + 5)) continue
    chapters.push({ start: seconds, title: match[4].trim() })
  }
  return [...new Map(chapters.map((item) => [item.start, item])).values()].sort((a, b) => a.start - b.start)
}

export function extractTimestamps(text: string, duration?: number): number[] {
  const values: number[] = []
  const pattern = /(?<!\d)(?:(\d+):)?(\d{1,2}):(\d{2})(?!\d)/g
  for (const match of text.matchAll(pattern)) {
    if (Number(match[3]) > 59) continue
    const value = Number(match[1] ?? 0) * 3600 + Number(match[2]) * 60 + Number(match[3])
    if (duration === undefined || value <= duration + 5) values.push(value)
  }
  return [...new Set(values)]
}

export interface YouTubeComment {
  id?: string
  snippet?: { authorDisplayName?: string; textDisplay?: string; likeCount?: number }
}

export interface YouTubeCommentThread {
  id?: string
  snippet?: { topLevelComment?: YouTubeComment }
  replies?: { comments?: YouTubeComment[] }
}

export interface YouTubeCommentsResponse { items?: YouTubeCommentThread[]; nextPageToken?: string }

export async function fetchComments(videoId: string, pageToken?: string, order: 'relevance' | 'time' = 'relevance', signal?: AbortSignal): Promise<YouTubeCommentsResponse> {
  const cacheKey = `comments:${videoId}:${order}:${pageToken ?? 'first'}`
  const cached = await cacheGet<YouTubeCommentsResponse>(cacheKey)
  if (cached) return cached.value
  const params: Record<string, string> = { part: 'snippet,replies', videoId, maxResults: '20', order, textFormat: 'plainText' }
  if (pageToken) params.pageToken = pageToken
  const value = await apiFetch<YouTubeCommentsResponse>('commentThreads', params, signal)
  await cachePut(cacheKey, value, COMMENTS_TTL)
  return value
}

export interface ChannelDetails { channelId: string; title: string; description?: string; thumbnail?: string; subscriberCount?: number; videoCount?: number }

export async function fetchChannel(channelId: string, signal?: AbortSignal): Promise<ChannelDetails> {
  const cached = await cacheGet<ChannelDetails>(`channel:${channelId}`)
  if (cached) return cached.value
  const data = await apiFetch<{ items?: Array<{ id: string; snippet?: { title?: string; description?: string; thumbnails?: { high?: { url: string }; medium?: { url: string } } }; statistics?: { subscriberCount?: string; videoCount?: string } }> }>('channels', { part: 'snippet,statistics', id: channelId }, signal)
  const item = data.items?.[0]
  if (!item) throw new Error('Channel is unavailable')
  const value = { channelId: item.id, title: item.snippet?.title ?? 'Channel', description: item.snippet?.description, thumbnail: item.snippet?.thumbnails?.high?.url ?? item.snippet?.thumbnails?.medium?.url, subscriberCount: item.statistics?.subscriberCount ? Number(item.statistics.subscriberCount) : undefined, videoCount: item.statistics?.videoCount ? Number(item.statistics.videoCount) : undefined }
  await cachePut(`channel:${channelId}`, value, METADATA_TTL)
  return value
}

export async function listChannelVideos(channelId: string, kind: 'video' | 'live' | 'upcoming' = 'video', pageToken?: string, signal?: AbortSignal): Promise<{ items: VideoRef[]; nextPageToken?: string }> {
  const params: Record<string, string> = { part: 'snippet', channelId, type: 'video', maxResults: '25', order: 'date' }
  if (kind !== 'video') params.eventType = kind
  if (pageToken) params.pageToken = pageToken
  const data = await apiFetch<{ items?: Array<{ id: { videoId?: string } }>; nextPageToken?: string }>('search', params, signal)
  const ids = (data.items ?? []).map((item) => item.id.videoId).filter(Boolean) as string[]
  const result = await verifyVideoIds(ids, signal)
  return { items: result.valid, nextPageToken: data.nextPageToken }
}

export interface PlaylistDetails {
  playlistId: string
  title: string
  description?: string
  thumbnail?: string
  channelId?: string
  channelTitle?: string
  itemCount?: number
}

export async function fetchPlaylistDetails(playlistId: string, signal?: AbortSignal): Promise<PlaylistDetails> {
  const cacheKey = `playlist:${playlistId}`
  const cached = await cacheGet<PlaylistDetails>(cacheKey)
  if (cached) return cached.value
  const data = await apiFetch<{ items?: Array<{ id: string; snippet?: { title?: string; description?: string; channelId?: string; channelTitle?: string; thumbnails?: { high?: { url: string }; medium?: { url: string } } }; contentDetails?: { itemCount?: number } }> }>(
    'playlists', { part: 'snippet,contentDetails', id: playlistId }, signal,
  )
  const item = data.items?.[0]
  if (!item) throw new Error('Playlist is unavailable')
  const value: PlaylistDetails = {
    playlistId: item.id,
    title: item.snippet?.title ?? 'Playlist',
    description: item.snippet?.description,
    thumbnail: item.snippet?.thumbnails?.high?.url ?? item.snippet?.thumbnails?.medium?.url,
    channelId: item.snippet?.channelId,
    channelTitle: item.snippet?.channelTitle,
    itemCount: item.contentDetails?.itemCount,
  }
  await cachePut(cacheKey, value, METADATA_TTL)
  return value
}

export async function fetchPlaylist(playlistId: string, pageToken?: string, signal?: AbortSignal): Promise<{ playlist: PlaylistDetails; items: VideoRef[]; nextPageToken?: string }> {
  const params: Record<string, string> = { part: 'snippet,contentDetails', playlistId, maxResults: '25' }
  if (pageToken) params.pageToken = pageToken
  const [playlist, data] = await Promise.all([
    fetchPlaylistDetails(playlistId, signal),
    apiFetch<{ items?: Array<{ contentDetails?: { videoId?: string } }>; nextPageToken?: string }>('playlistItems', params, signal),
  ])
  const ids = (data.items ?? []).map((item) => item.contentDetails?.videoId).filter(Boolean) as string[]
  const result = await verifyVideoIds(ids, signal)
  return { playlist, items: result.valid, nextPageToken: data.nextPageToken }
}
