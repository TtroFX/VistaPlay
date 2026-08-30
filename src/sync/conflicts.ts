import { createDefaultState } from '../config/features'
import type { AppSettings, PersistedAppState, SyncMetadata, SyncTombstoneKey, WatchProgress } from '../domain/types'

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

function recordRemovals(metadata: SyncMetadata, field: SyncTombstoneKey, beforeIds: string[], afterIds: string[], now: string): void {
  const next = new Set(afterIds)
  for (const id of beforeIds) if (!next.has(id)) metadata.removed[field][id] = now
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
  const removed = Object.fromEntries((Object.keys(defaults.removed) as SyncTombstoneKey[]).map((field) => [field, { ...source.removed?.[field] }])) as SyncMetadata['removed']
  return {
    settings: { ...source.settings }, added,
    removed,
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
  recordRemovals(metadata, 'history', Object.keys(before.history), Object.keys(after.history), now)
  recordRemovals(metadata, 'folders', before.folders.map((item) => item.id), after.folders.map((item) => item.id), now)
  recordRemovals(metadata, 'tags', before.tags.map((item) => item.id), after.tags.map((item) => item.id), now)
  recordRemovals(metadata, 'savedQueues', before.savedQueues.map((item) => item.id), after.savedQueues.map((item) => item.id), now)
  recordRemovals(metadata, 'smartFolders', before.smartFolders.map((item) => item.id), after.smartFolders.map((item) => item.id), now)
  recordRemovals(metadata, 'notes', before.notes.map((item) => item.videoId), after.notes.map((item) => item.videoId), now)
  recordRemovals(metadata, 'channelPreferences', before.channelPreferences.map((item) => item.channelId), after.channelPreferences.map((item) => item.channelId), now)
  recordRemovals(metadata, 'videoPreferences', before.videoPreferences.map((item) => item.videoId), after.videoPreferences.map((item) => item.videoId), now)
  recordRemovals(metadata, 'autoAddRules', before.autoAddRules.map((item) => item.id), after.autoAddRules.map((item) => item.id), now)
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

function mergeUpdatedVisible<T extends { updatedAt: string }>(local: T[], remote: T[], key: (item: T) => string, tombstones: Record<string, string>): T[] {
  return mergeUpdated(local, remote, key).filter((item) => item.updatedAt > (tombstones[key(item)] ?? EPOCH))
}

function mergeHistory(local: Record<string, WatchProgress>, remote: Record<string, WatchProgress>, tombstones: Record<string, string>): Record<string, WatchProgress> {
  const result: Record<string, WatchProgress> = {}
  for (const id of new Set([...Object.keys(local), ...Object.keys(remote)])) {
    const a = local[id]; const b = remote[id]
    if (!a) { result[id] = b; continue }
    if (!b) { result[id] = a; continue }
    const latest = a.updatedAt >= b.updatedAt ? a : b
    const state = latest.state === 'ARCHIVED' ? 'ARCHIVED' : a.state === 'COMPLETED' || b.state === 'COMPLETED' ? 'COMPLETED' : latest.state
    result[id] = { ...latest, state, watchedSeconds: Math.max(a.watchedSeconds, b.watchedSeconds), position: state === 'COMPLETED' ? 0 : latest.position }
  }
  return Object.fromEntries(Object.entries(result).filter(([id, item]) => item.updatedAt > (tombstones[id] ?? EPOCH)))
}

function mergedMetadata(local: SyncMetadata, remote: SyncMetadata): SyncMetadata {
  const removed = Object.fromEntries((Object.keys(local.removed) as SyncTombstoneKey[]).map((field) => [field, mergeClockMap(local.removed[field], remote.removed[field])])) as SyncMetadata['removed']
  return {
    settings: mergeClockMap(local.settings, remote.settings),
    added: {
      favorites: mergeClockMap(local.added.favorites, remote.added.favorites),
      watchLater: mergeClockMap(local.added.watchLater, remote.added.watchLater),
      inbox: mergeClockMap(local.added.inbox, remote.added.inbox)
    },
    removed,
    queueUpdatedAt: later(local.queueUpdatedAt, remote.queueUpdatedAt)
  }
}

export function mergeCloudStates(localInput: PersistedAppState, remoteInput: PersistedAppState): PersistedAppState {
  const local = { ...localInput, syncMetadata: ensureSyncMetadata(localInput) }
  const remote = { ...remoteInput, syncMetadata: ensureSyncMetadata(remoteInput) }
  const syncMetadata = mergedMetadata(local.syncMetadata, remote.syncMetadata)
  const folders = mergeUpdatedVisible(local.folders, remote.folders, (item) => item.id, syncMetadata.removed.folders)
  const tags = mergeUpdatedVisible(local.tags, remote.tags, (item) => item.id, syncMetadata.removed.tags)
  const settings = mergeSettingsValue(local.settings, remote.settings, '', local, remote) as AppSettings
  return {
    ...local,
    settings,
    videos: { ...remote.videos, ...local.videos },
    queue: remote.syncMetadata.queueUpdatedAt > local.syncMetadata.queueUpdatedAt ? remote.queue : local.queue,
    savedQueues: mergeUpdatedVisible(local.savedQueues, remote.savedQueues, (item) => item.id, syncMetadata.removed.savedQueues),
    favorites: resolveSet('favorites', local, remote), watchLater: resolveSet('watchLater', local, remote), inbox: resolveSet('inbox', local, remote),
    history: mergeHistory(local.history, remote.history, syncMetadata.removed.history), folders, tags,
    smartFolders: mergeUpdatedVisible(local.smartFolders, remote.smartFolders, (item) => item.id, syncMetadata.removed.smartFolders),
    notes: mergeUpdatedVisible(local.notes, remote.notes, (item) => item.videoId, syncMetadata.removed.notes),
    channelPreferences: mergeUpdatedVisible(local.channelPreferences, remote.channelPreferences, (item) => item.channelId, syncMetadata.removed.channelPreferences),
    videoPreferences: mergeUpdatedVisible(local.videoPreferences, remote.videoPreferences, (item) => item.videoId, syncMetadata.removed.videoPreferences),
    autoAddRules: mergeUpdatedVisible(local.autoAddRules, remote.autoAddRules, (item) => item.id, syncMetadata.removed.autoAddRules),
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
  const removed = Object.fromEntries((Object.keys(metadata.removed) as SyncTombstoneKey[]).map((field) => [field, prune(metadata.removed[field])])) as SyncMetadata['removed']
  return {
    ...state,
    videos: {}, aiImportHistory: [], lastPlayer: undefined,
    syncMetadata: {
      ...metadata,
      removed
    }
  }
}
