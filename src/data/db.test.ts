import { afterEach, describe, expect, it } from 'vitest'
import { cacheGet, cacheGetWithStale, cachePutMany, closeDatabaseForTests, dbGet, dbPut, DB_VERSION } from './db'

afterEach(async () => {
  await closeDatabaseForTests()
  indexedDB.deleteDatabase('vistaplay')
  indexedDB.deleteDatabase('vistaplay-backups')
})

describe('IndexedDB', () => {
  it('opens schema v3 and persists values', async () => {
    await dbPut('settings', 'test', { value: 3 })
    expect(await dbGet<{ value: number }>('settings', 'test')).toEqual({ value: 3 })
    const databases = await indexedDB.databases()
    expect(databases.find((item) => item.name === 'vistaplay')?.version).toBe(DB_VERSION)
  })

  it('keeps recently expired cache data available for an explicit fallback', async () => {
    await dbPut('cache', 'recent', { expiresAt: Date.now() - 1000, value: { title: 'cached' } })
    await dbPut('cache', 'old', { expiresAt: Date.now() - 100_000, value: { title: 'old' } })

    await expect(cacheGetWithStale<{ title: string }>('recent', 2000)).resolves.toMatchObject({ stale: true, value: { title: 'cached' } })
    await expect(cacheGetWithStale('old', 2000)).resolves.toBeUndefined()
    await expect(dbGet('cache', 'old')).resolves.toBeUndefined()
  })

  it('writes a metadata batch in one cache operation', async () => {
    await cachePutMany([
      { key: 'video:a', value: { title: 'A' }, ttlMs: 60_000 },
      { key: 'video:b', value: { title: 'B' }, ttlMs: 60_000 },
    ])

    await expect(cacheGet<{ title: string }>('video:a')).resolves.toMatchObject({ value: { title: 'A' } })
    await expect(cacheGet<{ title: string }>('video:b')).resolves.toMatchObject({ value: { title: 'B' } })
  })
})
