import { createDefaultState, defaultSettings } from '../config/features'
import type { PersistedAppState, WatchSession } from '../domain/types'
import { dbGet, dbPut, openDatabase } from './db'

const STATE_KEY = 'app-state-v3'

function mergeState(raw?: Partial<PersistedAppState>): PersistedAppState {
  const base = createDefaultState()
  if (!raw) return base
  return {
    ...base,
    ...raw,
    settings: {
      ...defaultSettings,
      ...raw.settings,
      theme: { ...defaultSettings.theme, ...raw.settings?.theme },
      layout: { ...defaultSettings.layout, ...raw.settings?.layout },
      playback: { ...defaultSettings.playback, ...raw.settings?.playback },
      features: { ...defaultSettings.features, ...raw.settings?.features }
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
