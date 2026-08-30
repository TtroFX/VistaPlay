import type { AppSettings, SearchFilters, SearchResult, VideoRef } from '../domain/types'
import { isLikelyShort } from './videoRules'

export type SearchSort = 'relevance' | 'newest' | 'views'

export interface SearchRuntimeOptions {
  shorts: boolean
  live: boolean
  whitelistOnly: boolean
  sort: SearchSort
}

export function searchLocalVideos(videos: VideoRef[], query: string, filters: SearchFilters): SearchResult[] {
  if (filters.type !== 'video') return []
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  const excludedChannels = new Set(filters.excludeChannels.map((value) => value.toLocaleLowerCase()))
  const excludedKeywords = filters.excludeKeywords.map((value) => value.trim().toLocaleLowerCase()).filter(Boolean)
  const publishedAfter = filters.publishedAfter ? Date.parse(filters.publishedAfter) : undefined
  return videos.filter((video) => {
    const text = `${video.title} ${video.channelTitle ?? ''} ${video.description ?? ''} ${(video.tags ?? []).join(' ')}`.toLocaleLowerCase()
    if (!terms.every((term) => text.includes(term))) return false
    if (video.channelId && excludedChannels.has(video.channelId.toLocaleLowerCase())) return false
    if (excludedKeywords.some((keyword) => text.includes(keyword))) return false
    if (publishedAfter !== undefined && (!video.publishedAt || Date.parse(video.publishedAt) < publishedAfter)) return false
    const duration = video.durationSeconds
    if (filters.duration === 'short' && (duration === undefined || duration >= 240)) return false
    if (filters.duration === 'medium' && (duration === undefined || duration < 240 || duration > 1200)) return false
    if (filters.duration === 'long' && (duration === undefined || duration <= 1200)) return false
    if (filters.live !== 'any' && video.liveStatus !== filters.live) return false
    const short = isLikelyShort(video)
    if (filters.shorts === 'exclude' && short) return false
    if (filters.shorts === 'only' && !short) return false
    return true
  }).map((video) => ({
    type: 'video', id: video.videoId, title: video.title, description: video.description,
    thumbnail: video.thumbnail, channelId: video.channelId, channelTitle: video.channelTitle, video,
  }))
}

export function filterAndSortSearchResults(results: SearchResult[], settings: AppSettings, options: SearchRuntimeOptions): SearchResult[] {
  const blockedVideos = new Set(settings.blacklist.videos)
  const blockedChannels = new Set(settings.blacklist.channels.map((value) => value.toLocaleLowerCase()))
  const blockedKeywords = settings.blacklist.keywords.map((value) => value.trim().toLocaleLowerCase()).filter(Boolean)
  const whitelist = new Set(settings.whitelistChannels.map((value) => value.toLocaleLowerCase()))
  const whitelistOnly = settings.whitelistOnly || options.whitelistOnly
  const visible = results.filter((result) => {
    const channelId = result.video?.channelId ?? result.channelId
    const text = `${result.title} ${result.description ?? ''}`.toLocaleLowerCase()
    if (result.type === 'video' && blockedVideos.has(result.id)) return false
    if (channelId && blockedChannels.has(channelId.toLocaleLowerCase())) return false
    if (blockedKeywords.some((keyword) => text.includes(keyword))) return false
    if (whitelistOnly && (!channelId || !whitelist.has(channelId.toLocaleLowerCase()))) return false
    if (result.video && !options.shorts && isLikelyShort(result.video)) return false
    if (result.video && !options.live && (result.video.liveStatus === 'live' || result.video.liveStatus === 'upcoming')) return false
    return true
  })
  if (options.sort === 'relevance' || visible.some((item) => !item.video)) return visible
  return [...visible].sort((a, b) => {
    if (options.sort === 'views') return (b.video?.viewCount ?? -1) - (a.video?.viewCount ?? -1)
    const aTime = Date.parse(a.video?.publishedAt ?? '')
    const bTime = Date.parse(b.video?.publishedAt ?? '')
    return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0)
  })
}
