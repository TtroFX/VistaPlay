const DB_NAME = 'vistaplay'
const BACKUP_DB = 'vistaplay-backups'
export const DB_VERSION = 3

const STORES = ['settings', 'videos', 'queue', 'progress', 'sessions', 'library', 'cache', 'migrations'] as const
type StoreName = (typeof STORES)[number]

function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result)
    value.onerror = () => reject(value.error)
  })
}

function openRaw(name: string, version?: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = version ? indexedDB.open(name, version) : indexedDB.open(name)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function currentVersion(): Promise<number> {
  if ('databases' in indexedDB) {
    const info = await indexedDB.databases()
    return info.find((db) => db.name === DB_NAME)?.version ?? 0
  }
  return 0
}

async function backupBeforeUpgrade(version: number): Promise<void> {
  if (!version || version >= DB_VERSION) return
  const existing = await openRaw(DB_NAME)
  const payload: Record<string, unknown[]> = {}
  for (const storeName of Array.from(existing.objectStoreNames)) {
    const tx = existing.transaction(storeName, 'readonly')
    payload[storeName] = await request(tx.objectStore(storeName).getAll())
  }
  existing.close()
  const backups = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(BACKUP_DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore('snapshots', { keyPath: 'id' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  const tx = backups.transaction('snapshots', 'readwrite')
  tx.objectStore('snapshots').put({ id: crypto.randomUUID(), sourceVersion: version, createdAt: new Date().toISOString(), payload })
  const all = await request(tx.objectStore('snapshots').getAll())
  const cutoff = Date.now() - 7 * 86400000
  for (const snapshot of all as Array<{ id: string; createdAt: string }>) if (Date.parse(snapshot.createdAt) < cutoff) tx.objectStore('snapshots').delete(snapshot.id)
  backups.close()
}

let dbPromise: Promise<IDBDatabase> | undefined

export async function openDatabase(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = (async () => {
    const version = await currentVersion()
    await backupBeforeUpgrade(version)
    return new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = (event) => {
        const db = req.result
        for (const name of STORES) if (!db.objectStoreNames.contains(name)) db.createObjectStore(name)
        req.transaction?.objectStore('migrations').put({ from: event.oldVersion, to: DB_VERSION, at: new Date().toISOString() }, `v${event.oldVersion}-v${DB_VERSION}`)
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
      req.onblocked = () => reject(new Error('Database migration blocked by another open tab'))
    })
  })()
  return dbPromise
}

export async function dbGet<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
  const db = await openDatabase()
  return request(db.transaction(store, 'readonly').objectStore(store).get(key)) as Promise<T | undefined>
}

export async function dbPut<T>(store: StoreName, key: IDBValidKey, value: T): Promise<void> {
  const db = await openDatabase()
  const tx = db.transaction(store, 'readwrite')
  tx.objectStore(store).put(value, key)
  await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error) })
}

export async function dbDelete(store: StoreName, key: IDBValidKey): Promise<void> {
  const db = await openDatabase()
  const tx = db.transaction(store, 'readwrite')
  tx.objectStore(store).delete(key)
  await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error) })
}

export async function dbClear(store: StoreName): Promise<void> {
  const db = await openDatabase()
  const tx = db.transaction(store, 'readwrite')
  tx.objectStore(store).clear()
  await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error) })
}

export async function cacheGet<T>(key: string): Promise<{ expiresAt: number; value: T } | undefined> {
  const record = await dbGet<{ expiresAt: number; value: T; accessedAt?: number }>('cache', key)
  if (!record) return undefined
  if (record.expiresAt <= Date.now()) { await dbDelete('cache', key); return undefined }
  void dbPut('cache', key, { ...record, accessedAt: Date.now() })
  return record
}

export async function cachePut<T>(key: string, value: T, ttlMs: number): Promise<void> {
  const serialized = JSON.stringify(value)
  await dbPut('cache', key, { expiresAt: Date.now() + ttlMs, accessedAt: Date.now(), size: new TextEncoder().encode(serialized).byteLength, value })
  const appState = await dbGet<{ settings?: { cacheLimitMb?: number } }>('settings', 'app-state-v3')
  await enforceCacheLimit(appState?.settings?.cacheLimitMb ?? 250)
}

export async function enforceCacheLimit(limitMb: number): Promise<void> {
  const db = await openDatabase()
  const tx = db.transaction('cache', 'readwrite')
  const store = tx.objectStore('cache')
  const keys = await request(store.getAllKeys())
  const values = await request(store.getAll()) as Array<{ size?: number; accessedAt?: number; expiresAt?: number }>
  const entries = values.map((value, index) => ({ key: keys[index], size: value.size ?? new TextEncoder().encode(JSON.stringify(value)).byteLength, accessedAt: value.accessedAt ?? 0, expired: (value.expiresAt ?? Infinity) <= Date.now() }))
  let total = entries.reduce((sum, entry) => sum + entry.size, 0)
  const limit = limitMb * 1024 * 1024
  for (const entry of entries.sort((a, b) => Number(b.expired) - Number(a.expired) || a.accessedAt - b.accessedAt)) {
    if (!entry.expired && total <= limit) break
    store.delete(entry.key); total -= entry.size
  }
  await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error) })
}

export async function closeDatabaseForTests(): Promise<void> {
  if (!dbPromise) return
  const db = await dbPromise
  db.close()
  dbPromise = undefined
}
