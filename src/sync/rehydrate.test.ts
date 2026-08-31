import { describe, expect, it, vi } from 'vitest'
import { createDefaultState } from '../config/features'
import type { VideoRef } from '../domain/types'
import { collectReferencedVideoIds, rehydrateReferencedVideos } from './rehydrate'

describe('synced video reference rehydration', () => {
  it('collects unique referenced IDs from synced user data', () => {
    const state = createDefaultState()
    state.favorites = ['favorite', 'shared']
    state.watchLater = ['later']
    state.inbox = ['inbox']
    state.history.history = { videoId: 'history', position: 1, duration: 10, watchedSeconds: 1, state: 'WATCHING', updatedAt: state.updatedAt }
    state.folders = [{ id: 'folder', name: 'Folder', videoIds: ['folder-video', 'shared'], pinned: false, updatedAt: state.updatedAt }]
    state.tags = [{ id: 'tag', canonical: 'tag', display: 'Tag', videoIds: ['tag-video'], updatedAt: state.updatedAt }]
    state.notes = [{ videoId: 'note', text: 'Note', updatedAt: state.updatedAt }]
    state.queue = [{ id: 'queue', video: { videoId: 'queue-video', title: 'Queue video' }, addedAt: state.updatedAt }]
    state.savedQueues = [{ id: 'saved', name: 'Saved', items: [{ id: 'saved-item', video: { videoId: 'saved-video', title: 'Saved video' }, addedAt: state.updatedAt }], updatedAt: state.updatedAt }]
    state.lastPlayer = { videoId: 'last-player', position: 3, updatedAt: state.updatedAt }

    expect(new Set(collectReferencedVideoIds(state))).toEqual(new Set([
      'favorite', 'shared', 'later', 'inbox', 'history', 'folder-video', 'tag-video', 'note', 'queue-video', 'saved-video', 'last-player'
    ]))
  })

  it('uses embedded queue metadata and verifies missing references', async () => {
    const state = createDefaultState()
    state.favorites = ['valid-video', 'invalid-video']
    state.queue = [{ id: 'queue', video: { videoId: 'queue-video', title: 'Embedded title' }, addedAt: state.updatedAt }]
    const verified: VideoRef = { videoId: 'valid-video', title: 'Verified title', channelTitle: 'Verified channel', available: true }
    const verifier = vi.fn(async () => ({ valid: [verified], invalid: ['invalid-video'] }))

    const result = await rehydrateReferencedVideos(state, verifier)

    expect(verifier).toHaveBeenCalledWith(['valid-video', 'invalid-video'])
    expect(result.videos['valid-video']).toEqual(verified)
    expect(result.videos['invalid-video']).toMatchObject({ title: 'Video invalid-video', available: false, unavailableReason: 'unknown' })
    expect(result.videos['queue-video']).toMatchObject({ title: 'Embedded title' })
    expect(result.revision).toBe(state.revision)
    expect(result.updatedAt).toBe(state.updatedAt)
  })

  it('keeps safe local fallbacks when verification is unavailable', async () => {
    const state = createDefaultState()
    state.watchLater = ['offline-video']

    const result = await rehydrateReferencedVideos(state, async () => { throw new Error('offline') })

    expect(result.videos['offline-video']).toEqual({
      videoId: 'offline-video',
      title: 'Video offline-video',
      thumbnail: 'https://i.ytimg.com/vi/offline-video/hqdefault.jpg'
    })
  })
})
