import { createDefaultState } from '../config/features'
import type { AppSettings, PersistedAppState, SyncMetadata, WatchProgress } from '../domain/types'

const EPOCH = new Date(0).toISOString()
const SET_FIELDS = ['favorites', 'watchLater', 'inbox'] as const

function later(a?: string, b?: string): string {
  return (a ?? EPOCH) >= (b ?? EPOCH) ? (a ?? EPOCH) : (b ?? EPOCH)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function changedSettingPaths(before: unknown, after: unknown, path = '', result: string[] = []): string[] {
  if (Object.is(before, after)) return result
  if (isRecord(before) && isRecord(after)) {
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) changedSettingPaths(before[key], after[key], path ? `${path}.${key}` : key, result)
    return result
  }
  result.push(path)
  return result
}

function mergeClockMap(a: Record<string, string>, b: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = { ...a }
  for (const [key, value] of Object.entries(b)) result[key] = later(result[key], value)
  return result
}

export function ensureSyncMetadata(state: PersistedAppState): SyncMetadata {
  const defaults = createDefaultState().syncMetadata
  const source = state.syncMetadata ?? defaults
  const added = {
    favorites: { ...source.added?.favorites },
    watchLater: { ...source.added?.watchLater },
    inbox: { ...source.added?.inbox }
  }
  for (const field of SET_FIELDS) for (const id of state[field]) added[field][id] ??= state.updatedAt
  return {
    settings: { ...source.settings }, added,
    removed: {
      favorites: { ...source.removed?.favorites }, watchLater: { ...source.removed?.watchLater }, inbox: { ...source.removed?.inbox },
      folders: { ...source.removed?.folders }, tags: { ...source.removed?.tags }
    },
    queueUpdatedAt: source.queueUpdatedAt ?? state.updatedAt
  }
}

export function stampSyncMetadata(before: PersistedAppState, after: PersistedAppState, now: string): SyncMetadata {
  const metadata = ensureSyncMetadata(before)
  for (const path of changedSettingPaths(before.settings, after.settings)) metadata.settings[path] = now
  for (const field of SET_FIELDS) {
    const previous = new Set(before[field]); const next = new Set(after[field])
    for (const id of next) if (!previous.has(id)) metadata.added[field][id] = now
    for (const id of previous) if (!next.has(id)) metadata.removed[field][id] = now
  }
  for (const field of ['folders', 'tags'] as const) {
    const next = new Set(after[field].map((item) => item.id))
    for (const item of before[field]) if (!next.has(item.id)) metadata.removed[field][item.id] = now
  }
  if (before.queue !== after.queue) metadata.queueUpdatedAt = now
  return metadata
}

function mergeSettingsValue(local: unknown, remote: unknown, path: string, localState: PersistedAppState, remoteState: PersistedAppState): unknown {
  if (isRecord(local) && isRecord(remote)) {
    const result: Record<string, unknown> = {}
    for (const key of new Set([...Object.keys(local), ...Object.keys(remote)])) result[key] = mergeSettingsValue(local[key], remote[key], path ? `${path}.${key}` : key, localState, remoteState)
    return result
  }
  const localClock = localState.syncMetadata.settings[path] ?? localState.settings.updatedAt
  const remoteClock = remoteState.syncMetadata.settings[path] ?? remoteState.settings.updatedAt
  return remoteClock > localClock ? remote : local
}

function resolveSet(field: typeof SET_FIELDS[number], local: PersistedAppState, remote: PersistedAppState): string[] {
  const candidates = new Set([...local[field], ...remote[field], ...Object.keys(local.syncMetadata.added[field]), ...Object.keys(remote.syncMetadata.added[field])])
  return [...candidates].filter((id) => {
    const added = later(local.syncMetadata.added[field][id], remote.syncMetadata.added[field][id])
    const removed = later(local.syncMetadata.removed[field][id], remote.syncMetadata.removed[field][id])
    return added > removed
  })
}

function mergeUpdated<T extends { updatedAt: string }>(local: T[], remote: T[], key: (item: T) => string): T[] {
  const result = new Map<string, T>()
  for (const item of [...local, ...remote]) {
    const id = key(item); const existing = result.get(id)
    if (!existing || item.updatedAt > existing.updatedAt) result.set(id, item)
  }
  return [...result.values()]
}

function mergeHistory(local: Record<string, WatchProgress>, remote: Record<string, WatchProgress>): Record<string, WatchProgress> {
  const result: Record<string, WatchProgress> = {}
  for (const id of new Set([...Object.keys(local), ...Object.keys(remote)])) {
    const a = local[id]; const b = remote[id]
    if (!a) { result[id] = b; continue }
    if (!b) { result[id] = a; continue }
    const latest = a.updatedAt >= b.updatedAt ? a : b
    const state = latest.state === 'ARCHIVED' ? 'ARCHIVED' : a.state === 'COMPLETED' || b.state === 'COMPLETED' ? 'COMPLETED' : latest.state
    result[id] = { ...latest, state, watchedSeconds: Math.max(a.watchedSeconds, b.watchedSeconds), position: state === 'COMPLETED' ? 0 : latest.position }
  }
  return result
}

function mergedMetadata(local: SyncMetadata, remote: SyncMetadata): SyncMetadata {
  return {
    settings: mergeClockMap(local.settings, remote.settings),
    added: {
      favorites: mergeClockMap(local.added.favorites, remote.added.favorites),
      watchLater: mergeClockMap(local.added.watchLater, remote.added.watchLater),
      inbox: mergeClockMap(local.added.inbox, remote.added.inbox)
    },
    removed: {
      favorites: mergeClockMap(local.removed.favorites, remote.removed.favorites),
      watchLater: mergeClockMap(local.removed.watchLater, remote.removed.watchLater),
      inbox: mergeClockMap(local.removed.inbox, remote.removed.inbox),
      folders: mergeClockMap(local.removed.folders, remote.removed.folders),
      tags: mergeClockMap(local.removed.tags, remote.removed.tags)
    },
    queueUpdatedAt: later(local.queueUpdatedAt, remote.queueUpdatedAt)
  }
}

export function mergeCloudStates(localInput: PersistedAppState, remoteInput: PersistedAppState): PersistedAppState {
  const local = { ...localInput, syncMetadata: ensureSyncMetadata(localInput) }
  const remote = { ...remoteInput, syncMetadata: ensureSyncMetadata(remoteInput) }
  const syncMetadata = mergedMetadata(local.syncMetadata, remote.syncMetadata)
  const folders = mergeUpdated(local.folders, remote.folders, (item) => item.id).filter((item) => item.updatedAt > (syncMetadata.removed.folders[item.id] ?? EPOCH))
  const tags = mergeUpdated(local.tags, remote.tags, (item) => item.id).filter((item) => item.updatedAt > (syncMetadata.removed.tags[item.id] ?? EPOCH))
  const settings = mergeSettingsValue(local.settings, remote.settings, '', local, remote) as AppSettings
  return {
    ...local,
    settings,
    videos: { ...remote.videos, ...local.videos },
    queue: remote.syncMetadata.queueUpdatedAt > local.syncMetadata.queueUpdatedAt ? remote.queue : local.queue,
    savedQueues: mergeUpdated(local.savedQueues, remote.savedQueues, (item) => item.id),
    favorites: resolveSet('favorites', local, remote), watchLater: resolveSet('watchLater', local, remote), inbox: resolveSet('inbox', local, remote),
    history: mergeHistory(local.history, remote.history), folders, tags,
    smartFolders: mergeUpdated(local.smartFolders, remote.smartFolders, (item) => item.id),
    notes: mergeUpdated(local.notes, remote.notes, (item) => item.videoId),
    channelPreferences: mergeUpdated(local.channelPreferences, remote.channelPreferences, (item) => item.channelId),
    videoPreferences: mergeUpdated(local.videoPreferences, remote.videoPreferences, (item) => item.videoId),
    autoAddRules: mergeUpdated(local.autoAddRules, remote.autoAddRules, (item) => item.id),
    searchHistory: [...new Set([...local.searchHistory, ...remote.searchHistory])].slice(0, 50),
    aiImportHistory: local.aiImportHistory,
    lastPlayer: local.lastPlayer,
    syncMetadata,
    revision: Math.max(local.revision, remote.revision),
    updatedAt: later(local.updatedAt, remote.updatedAt)
  }
}

export function prepareCloudState(state: PersistedAppState, now = Date.now()): PersistedAppState {
  const cutoff = now - 30 * 86400000
  const metadata = ensureSyncMetadata(state)
  const prune = (values: Record<string, string>) => Object.fromEntries(Object.entries(values).filter(([, at]) => Date.parse(at) >= cutoff))
  return {
    ...state,
    videos: {}, aiImportHistory: [], lastPlayer: undefined,
    syncMetadata: {
      ...metadata,
      removed: {
        favorites: prune(metadata.removed.favorites), watchLater: prune(metadata.removed.watchLater), inbox: prune(metadata.removed.inbox),
        folders: prune(metadata.removed.folders), tags: prune(metadata.removed.tags)
      }
    }
  }
}
