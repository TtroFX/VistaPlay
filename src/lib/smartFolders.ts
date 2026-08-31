import type { PersistedAppState, SmartCondition, SmartFolder, VideoRef } from '../domain/types'

export function smartFolderUsesField(folder: SmartFolder, field: SmartCondition['field']): boolean {
  return folder.conditions.some((condition) => condition.field === field)
    || Boolean(folder.groups?.some((group) => group.conditions.some((condition) => condition.field === field)))
}

function matchesCondition(video: VideoRef, condition: SmartCondition, state: PersistedAppState, now: number): boolean {
  const progress = state.history[video.videoId]
  let actual: string | number | boolean | undefined
  switch (condition.field) {
    case 'channel': actual = video.channelId ?? video.channelTitle; break
    case 'category': actual = video.categoryId; break
    case 'tag': actual = state.tags.filter((tag) => tag.videoIds.includes(video.videoId)).map((tag) => tag.canonical).join(' '); break
    case 'duration': actual = video.durationSeconds; break
    case 'watchState': actual = progress?.state ?? 'UNWATCHED'; break
    case 'favorite': actual = state.favorites.includes(video.videoId); break
    case 'addedDate': actual = progress?.updatedAt ? Math.max(0, (now - Date.parse(progress.updatedAt)) / 86400000) : undefined; break
    case 'publishedDate': actual = video.publishedAt ? Math.max(0, (now - Date.parse(video.publishedAt)) / 86400000) : undefined; break
  }
  if (condition.op === 'eq') return String(actual).toLowerCase() === String(condition.value).toLowerCase()
  if (condition.op === 'contains') return String(actual ?? '').toLowerCase().includes(String(condition.value).toLowerCase())
  if (condition.op === 'lt') return Number(actual) < Number(condition.value)
  return Number(actual) > Number(condition.value)
}

export function evaluateSmartFolder(folder: SmartFolder, state: PersistedAppState, now = Date.now()): VideoRef[] {
  const videos = Object.values(state.videos)
  return videos.filter((video) => {
    const groups = folder.groups?.length ? folder.groups : [{ operator: folder.operator, conditions: folder.conditions }]
    const groupOutcomes = groups.map((group) => {
      if (!group.conditions.length) return false
      const outcomes = group.conditions.map((condition) => matchesCondition(video, condition, state, now))
      return group.operator === 'and' ? outcomes.every(Boolean) : outcomes.some(Boolean)
    })
    return folder.operator === 'and' ? groupOutcomes.every(Boolean) : groupOutcomes.some(Boolean)
  })
}
