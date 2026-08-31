import { createDefaultState, defaultSettings } from '../config/features'
import type { PersistedAppState, SyncMetadata, SyncTombstoneKey, WatchSession } from '../domain/types'
import { dbGet, dbPut, openDatabase } from './db'

const STATE_KEY = 'app-state-v3'
const LEGACY_DEFAULT_ACCENT = '#176b5b'

function mergeState(raw?: Partial<PersistedAppState>): PersistedAppState {
  const base = createDefaultState()
  if (!raw) return base
  const syncMetadata = raw.syncMetadata ?? base.syncMetadata
  const removed = Object.fromEntries((Object.keys(base.syncMetadata.removed) as SyncTombstoneKey[]).map((field) => [field, { ...base.syncMetadata.removed[field], ...syncMetadata.removed?.[field] }])) as SyncMetadata['removed']
  const storedAccent = raw.settings?.theme?.accent
  const accent = !storedAccent || storedAccent.toLowerCase() === LEGACY_DEFAULT_ACCENT ? defaultSettings.theme.accent : storedAccent
  return {
    ...base,
    ...raw,
    settings: {
      ...defaultSettings,
      ...raw.settings,
      theme: { ...defaultSettings.theme, ...raw.settings?.theme, accent },
      layout: { ...defaultSettings.layout, ...raw.settings?.layout },
      playback: { ...defaultSettings.playback, ...raw.settings?.playback },
      features: { ...defaultSettings.features, ...raw.settings?.features }
    },
    syncMetadata: {
      ...base.syncMetadata,
      ...syncMetadata,
      settings: { ...base.syncMetadata.settings, ...syncMetadata.settings },
      added: {
        favorites: { ...base.syncMetadata.added.favorites, ...syncMetadata.added?.favorites },
        watchLater: { ...base.syncMetadata.added.watchLater, ...syncMetadata.added?.watchLater },
        inbox: { ...base.syncMetadata.added.inbox, ...syncMetadata.added?.inbox }
      },
      removed
    }
  }
}

export async function loadAppState(): Promise<PersistedAppState> {
  return mergeState(await dbGet<Partial<PersistedAppState>>('settings', STATE_KEY))
}

export async function saveAppState(state: PersistedAppState): Promise<void> {
  await dbPut('settings', STATE_KEY, state)
}

export async function saveWatchSession(session: WatchSession): Promise<void> {
  await dbPut('sessions', session.sessionId, session)
}

export async function loadWatchSessions(): Promise<WatchSession[]> {
  const db = await openDatabase()
  const req = db.transaction('sessions', 'readonly').objectStore('sessions').getAll()
  return new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error) })
}
