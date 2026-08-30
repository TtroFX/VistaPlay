import type { PersistedAppState, VideoRef } from '../domain/types'
import { verifyVideoIds } from '../lib/youtube'

export type VideoVerifier = (ids: string[]) => Promise<{ valid: VideoRef[]; invalid: string[] }>

function fallbackVideo(videoId: string): VideoRef {
  return {
    videoId,
    title: `Video ${videoId}`,
    thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
  }
}

export function collectReferencedVideoIds(state: PersistedAppState): string[] {
  const ids = new Set<string>()
  const add = (videoId?: string) => { if (videoId) ids.add(videoId) }

  state.favorites.forEach(add)
  state.watchLater.forEach(add)
  state.inbox.forEach(add)
  Object.keys(state.history).forEach(add)
  state.folders.forEach((folder) => folder.videoIds.forEach(add))
  state.tags.forEach((tag) => tag.videoIds.forEach(add))
  state.notes.forEach((note) => add(note.videoId))
  state.queue.forEach((item) => add(item.video.videoId))
  state.savedQueues.forEach((queue) => queue.items.forEach((item) => add(item.video.videoId)))
  add(state.lastPlayer?.videoId)

  return [...ids]
}

export async function rehydrateReferencedVideos(
  state: PersistedAppState,
  verifier: VideoVerifier = (ids) => verifyVideoIds(ids)
): Promise<PersistedAppState> {
  const videos = { ...state.videos }

  for (const item of state.queue) videos[item.video.videoId] ??= item.video
  for (const queue of state.savedQueues) {
    for (const item of queue.items) videos[item.video.videoId] ??= item.video
  }

  const missing = collectReferencedVideoIds(state).filter((videoId) => !videos[videoId])
  for (const videoId of missing) videos[videoId] = fallbackVideo(videoId)

  for (let offset = 0; offset < missing.length; offset += 50) {
    const batch = missing.slice(offset, offset + 50)
    try {
      const result = await verifier(batch)
      for (const video of result.valid) videos[video.videoId] = video
      for (const videoId of result.invalid) {
        const existing = videos[videoId] ?? fallbackVideo(videoId)
        videos[videoId] = { ...existing, available: false, unavailableReason: 'unknown' }
      }
    } catch {
      // Local references stay usable when API configuration, quota, or network is unavailable.
    }
  }

  return { ...state, videos }
}
