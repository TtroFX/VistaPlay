import { afterEach, describe, expect, it } from 'vitest'
import { closeDatabaseForTests, dbGet, dbPut, DB_VERSION } from './db'

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
})
