import { describe, expect, it } from 'vitest'
import { createDefaultState } from '../config/features'
import { mergeCloudStates, prepareCloudState, stampSyncMetadata } from './conflicts'

describe('cloud conflict resolution', () => {
  it('uses add/remove clocks and keeps completed progress sticky', () => {
    const local = createDefaultState(); const remote = createDefaultState()
    local.favorites = ['a']; local.updatedAt = '2026-01-01T00:00:00.000Z'; local.syncMetadata = stampSyncMetadata(createDefaultState(), local, local.updatedAt)
    remote.history.a = { videoId: 'a', position: 30, duration: 100, watchedSeconds: 30, state: 'COMPLETED', updatedAt: '2026-01-02T00:00:00.000Z' }
    local.history.a = { videoId: 'a', position: 70, duration: 100, watchedSeconds: 70, state: 'WATCHING', updatedAt: '2026-01-03T00:00:00.000Z' }
    remote.syncMetadata.removed.favorites.a = '2026-01-04T00:00:00.000Z'
    const result = mergeCloudStates(local, remote)
    expect(result.favorites).not.toContain('a')
    expect(result.history.a.state).toBe('COMPLETED')
  })

  it('merges settings per leaf clock and excludes local-only cloud data', () => {
    const local = createDefaultState(); const remote = createDefaultState()
    local.settings.theme.accent = '#111111'; local.syncMetadata.settings['theme.accent'] = '2026-01-03T00:00:00.000Z'
    remote.settings.theme.accent = '#222222'; remote.settings.playback.globalRate = 1.5
    remote.syncMetadata.settings['theme.accent'] = '2026-01-02T00:00:00.000Z'; remote.syncMetadata.settings['playback.globalRate'] = '2026-01-04T00:00:00.000Z'
    const result = mergeCloudStates(local, remote)
    expect(result.settings.theme.accent).toBe('#111111')
    expect(result.settings.playback.globalRate).toBe(1.5)
    local.videos.a = { videoId: 'a', title: 'Local cache' }; local.aiImportHistory = [{ id: 'x', query: 'q', videoIds: ['a'], createdAt: new Date().toISOString() }]
    expect(prepareCloudState(local).videos).toEqual({})
    expect(prepareCloudState(local).aiImportHistory).toEqual([])
  })
})
