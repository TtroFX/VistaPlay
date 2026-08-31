import { describe, expect, it } from 'vitest'
import { addAIImportHistory, parseAIImport, parseSmartSearch, parseYTRec } from './aiBridge'

describe('AI import validation', () => {
  it('keeps at most 50 local imports and removes entries older than 30 days', () => {
    const now = Date.parse('2026-08-30T00:00:00.000Z')
    const recent = Array.from({ length: 55 }, (_, index) => ({ id: `recent-${index}`, query: 'query', videoIds: [], createdAt: new Date(now - index * 3600000).toISOString() }))
    const old = { id: 'old', query: 'old', videoIds: [], createdAt: '2026-06-01T00:00:00.000Z' }
    const entry = { id: 'current', query: 'current', videoIds: ['TESTVIDEO01'], createdAt: new Date(now).toISOString() }
    const result = addAIImportHistory([...recent, old], entry, now)
    expect(result).toHaveLength(50)
    expect(result[0]).toEqual(entry)
    expect(result.some((item) => item.id === 'old')).toBe(false)
  })
  it('accepts YTREC v1 and warns about unknown fields', () => {
    const parsed = parseYTRec(JSON.stringify({ version: 1, type: 'youtube_recommendations', query: 'test', extra: true, items: [{ videoId: 'dQw4w9WgXcQ', title: 'untrusted', channel: 'untrusted', reason: 'fit', priority: 1, extraItem: 1 }] }))
    expect(parsed.items).toHaveLength(1)
    expect(parsed.warnings).toHaveLength(2)
  })
  it('rejects unsupported versions and invalid ids', () => {
    expect(() => parseYTRec('{"version":2,"type":"youtube_recommendations","query":"x","items":[]}')).toThrow(/Unsupported/)
    expect(() => parseYTRec('{"version":1,"type":"youtube_recommendations","query":"x","items":[{"videoId":"bad","reason":"x","priority":1}]}')).toThrow(/videoId/)
  })
  it('limits smart search to ten queries', () => {
    const searches = Array.from({ length: 11 }, (_, i) => ({ query: `q${i}` }))
    expect(() => parseSmartSearch(JSON.stringify({ version: 1, type: 'youtube_search', searches }))).toThrow(/1 to 10/)
  })
  it('requires a smart search query and warns about unknown fields', () => {
    expect(() => parseSmartSearch('{"version":1,"type":"youtube_search","searches":[]}')).toThrow(/1 to 10/)
    const parsed = parseSmartSearch('{"version":1,"type":"youtube_search","extra":true,"searches":[{"query":" tablet ","filters":{"shorts":false,"extra":1}}]}')
    expect(parsed.searches[0].query).toBe('tablet')
    expect(parsed.warnings).toHaveLength(2)
  })
  it('bounds and dispatches input before trusting the document type', () => {
    expect(parseAIImport('{"version":1,"type":"youtube_search","searches":[{"query":"tablet"}]}').type).toBe('youtube_search')
    expect(() => parseAIImport(' '.repeat(64 * 1024 + 1))).toThrow(/64 KiB/)
  })
})
