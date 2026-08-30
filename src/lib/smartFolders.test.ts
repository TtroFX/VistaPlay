import { describe, expect, it } from 'vitest'
import { createDefaultState } from '../config/features'
import { evaluateSmartFolder, smartFolderUsesField } from './smartFolders'

describe('smart folder groups', () => {
  it('supports AND/OR and date age conditions', () => {
    const state = createDefaultState()
    state.videos.a = { videoId: 'a', title: 'A', channelId: 'c1', publishedAt: '2026-01-08T00:00:00.000Z' }
    state.videos.b = { videoId: 'b', title: 'B', channelId: 'c2', publishedAt: '2025-12-01T00:00:00.000Z' }
    state.favorites = ['a']
    const now = Date.parse('2026-01-10T00:00:00.000Z')
    const folder = { id: 'f', name: 'Recent favorites', operator: 'and' as const, updatedAt: '', conditions: [{ field: 'favorite' as const, op: 'eq' as const, value: true }, { field: 'publishedDate' as const, op: 'lt' as const, value: 7 }] }
    expect(evaluateSmartFolder(folder, state, now).map((video) => video.videoId)).toEqual(['a'])
  })

  it('combines nested condition groups with a root operator', () => {
    const state = createDefaultState()
    state.videos.a = { videoId: 'a', title: 'A', channelId: 'c1', publishedAt: '2026-01-08T00:00:00.000Z' }
    state.videos.b = { videoId: 'b', title: 'B', channelId: 'c2', publishedAt: '2025-12-01T00:00:00.000Z' }
    state.videos.c = { videoId: 'c', title: 'C', channelId: 'c3', publishedAt: '2026-01-08T00:00:00.000Z' }
    state.favorites = ['a', 'b']
    const folder = {
      id: 'nested', name: 'Grouped', operator: 'or' as const, updatedAt: '', conditions: [],
      groups: [
        { operator: 'and' as const, conditions: [{ field: 'favorite' as const, op: 'eq' as const, value: true }, { field: 'publishedDate' as const, op: 'lt' as const, value: 7 }] },
        { operator: 'and' as const, conditions: [{ field: 'channel' as const, op: 'eq' as const, value: 'c2' }] },
      ],
    }
    expect(evaluateSmartFolder(folder, state, Date.parse('2026-01-10T00:00:00.000Z')).map((video) => video.videoId)).toEqual(['a', 'b'])
    expect(smartFolderUsesField({ ...folder, conditions: [] }, 'channel')).toBe(true)
    expect(smartFolderUsesField({ ...folder, conditions: [] }, 'tag')).toBe(false)
  })
})
