import { describe, expect, it } from 'vitest'
import { parseSmartSearch, parseYTRec } from './aiBridge'

describe('AI import validation', () => {
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
    expect(() => parseSmartSearch(JSON.stringify({ version: 1, type: 'youtube_search', searches }))).toThrow(/at most 10/)
  })
})
