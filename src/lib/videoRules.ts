import type { AppSettings, AutoAddRule, QueueItem, VideoRef } from '../domain/types'

export function isLikelyShort(video: VideoRef): boolean {
  return /#shorts\b/i.test(`${video.title} ${video.description ?? ''}`) || (video.durationSeconds !== undefined && video.durationSeconds <= 60)
}

export function applyVisibilityRules(videos: VideoRef[], settings: AppSettings): VideoRef[] {
  const videoBlock = new Set(settings.blacklist.videos)
  const channelBlock = new Set(settings.blacklist.channels.map((id) => id.toLowerCase()))
  const keywords = settings.blacklist.keywords.map((item) => item.toLowerCase()).filter(Boolean)
  const whitelist = new Set(settings.whitelistChannels.map((id) => id.toLowerCase()))
  return videos.filter((video) => {
    if (videoBlock.has(video.videoId) || channelBlock.has((video.channelId ?? '').toLowerCase())) return false
    if (keywords.some((word) => `${video.title} ${video.description ?? ''}`.toLowerCase().includes(word))) return false
    return !settings.whitelistOnly || Boolean(video.channelId && whitelist.has(video.channelId.toLowerCase()))
  })
}

export function matchesAutoAddRule(video: VideoRef, rule: AutoAddRule, now = Date.now()): boolean {
  if (!rule.enabled || video.available === false) return false
  if (rule.channelId && video.channelId !== rule.channelId) return false
  const text = `${video.title} ${video.description ?? ''}`.toLowerCase()
  if (rule.includeKeyword && !text.includes(rule.includeKeyword.toLowerCase())) return false
  if (rule.excludeKeyword && text.includes(rule.excludeKeyword.toLowerCase())) return false
  if (rule.categoryId && video.categoryId !== rule.categoryId) return false
  if (rule.maxDuration !== undefined && (video.durationSeconds ?? Infinity) > rule.maxDuration) return false
  if (rule.live !== undefined && (video.liveStatus === 'live') !== rule.live) return false
  if (rule.shorts !== undefined && isLikelyShort(video) !== rule.shorts) return false
  if (rule.publishedWithinDays !== undefined && (!video.publishedAt || now - Date.parse(video.publishedAt) > rule.publishedWithinDays * 86400000)) return false
  return true
}

export function applyAutoAddRules(videos: VideoRef[], rules: AutoAddRule[], currentQueue: QueueItem[]): QueueItem[] {
  const existing = new Set(currentQueue.map((item) => item.video.videoId))
  const additions: QueueItem[] = []
  for (const rule of rules) {
    let count = 0
    for (const video of videos) {
      if (count >= 20 || existing.has(video.videoId) || !matchesAutoAddRule(video, rule)) continue
      additions.push({ id: crypto.randomUUID(), video, addedAt: new Date().toISOString() })
      existing.add(video.videoId); count += 1
    }
  }
  return additions
}
