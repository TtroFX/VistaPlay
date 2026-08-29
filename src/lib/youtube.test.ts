import { describe, expect, it } from 'vitest'
import { extractChapters, extractTimestamps, parseDuration, parseYouTubeInput } from './youtube'

describe('YouTube parsing', () => {
  it('recognizes video, channel and playlist links', () => {
    expect(parseYouTubeInput('https://youtu.be/dQw4w9WgXcQ')?.type).toBe('video')
    expect(parseYouTubeInput('https://www.youtube.com/channel/UC123')?.id).toBe('UC123')
    expect(parseYouTubeInput('https://www.youtube.com/playlist?list=PL123')?.type).toBe('playlist')
    expect(parseYouTubeInput('https://example.com/watch?v=dQw4w9WgXcQ')).toBeUndefined()
  })
  it('parses ISO duration', () => expect(parseDuration('PT1H2M3S')).toBe(3723))
  it('extracts valid timestamps and rejects impossible or out-of-range values', () => {
    expect(extractTimestamps('intro 1:23 bad 2:99 end 10:00', 300)).toEqual([83])
  })
  it('sorts and deduplicates description chapters', () => {
    expect(extractChapters('1:00 Middle\n0:00 Start\n1:00 Duplicate', 120)).toEqual([{ start: 0, title: 'Start' }, { start: 60, title: 'Duplicate' }])
  })
})
