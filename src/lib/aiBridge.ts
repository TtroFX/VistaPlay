import type { VideoRef } from '../domain/types'

export interface YTRecItem { videoId: string; title?: string; channel?: string; reason: string; priority: number }
export interface YTRecImport { version: 1; type: 'youtube_recommendations'; query: string; items: YTRecItem[]; warnings: string[] }
export interface SmartSearchImport { version: 1; type: 'youtube_search'; searches: Array<{ query: string; filters?: { shorts?: boolean; live?: boolean } }>; warnings: string[] }
export type AIImportDocument = YTRecImport | SmartSearchImport

function parseStrictJson(input: string): unknown {
  const bytes = new TextEncoder().encode(input).byteLength
  if (bytes > 64 * 1024) throw new Error('Import exceeds 64 KiB')
  const cleaned = input.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  return JSON.parse(cleaned)
}

function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value) }

export function parseAIImport(input: string): AIImportDocument {
  const value = parseStrictJson(input)
  if (!isRecord(value)) throw new Error('Root must be a JSON object')
  if (value.type === 'youtube_recommendations') return parseYTRecValue(value)
  if (value.type === 'youtube_search') return parseSmartSearchValue(value)
  throw new Error('Invalid import type')
}

export function parseYTRec(input: string): YTRecImport {
  return parseYTRecValue(parseStrictJson(input))
}

function parseYTRecValue(value: unknown): YTRecImport {
  if (!isRecord(value)) throw new Error('Root must be a JSON object')
  if (value.version !== 1) throw new Error('Unsupported YTREC version')
  if (value.type !== 'youtube_recommendations') throw new Error('Invalid import type')
  if (typeof value.query !== 'string') throw new Error('query must be a string')
  if (!Array.isArray(value.items) || value.items.length > 20) throw new Error('items must contain at most 20 videos')
  const warnings: string[] = []
  const rootKnown = new Set(['version', 'type', 'query', 'items'])
  for (const key of Object.keys(value)) if (!rootKnown.has(key)) warnings.push(`Ignored unknown field: ${key}`)
  const items = value.items.map((raw, index): YTRecItem => {
    if (!isRecord(raw) || typeof raw.videoId !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(raw.videoId)) throw new Error(`items[${index}].videoId is invalid`)
    if (typeof raw.reason !== 'string' || typeof raw.priority !== 'number') throw new Error(`items[${index}] requires reason and numeric priority`)
    for (const key of Object.keys(raw)) if (!['videoId', 'title', 'channel', 'reason', 'priority'].includes(key)) warnings.push(`Ignored unknown item field: ${key}`)
    return { videoId: raw.videoId, title: typeof raw.title === 'string' ? raw.title : undefined, channel: typeof raw.channel === 'string' ? raw.channel : undefined, reason: raw.reason, priority: raw.priority }
  })
  return { version: 1, type: 'youtube_recommendations', query: value.query, items, warnings }
}

export function parseSmartSearch(input: string): SmartSearchImport {
  return parseSmartSearchValue(parseStrictJson(input))
}

function parseSmartSearchValue(value: unknown): SmartSearchImport {
  if (!isRecord(value) || value.version !== 1 || value.type !== 'youtube_search') throw new Error('Invalid or unsupported smart search document')
  if (!Array.isArray(value.searches) || value.searches.length < 1 || value.searches.length > 10) throw new Error('searches must contain 1 to 10 queries')
  const warnings: string[] = []
  for (const key of Object.keys(value)) if (!['version', 'type', 'searches'].includes(key)) warnings.push(`Ignored unknown field: ${key}`)
  const searches = value.searches.map((raw, index) => {
    if (!isRecord(raw) || typeof raw.query !== 'string' || !raw.query.trim()) throw new Error(`searches[${index}].query is invalid`)
    for (const key of Object.keys(raw)) if (!['query', 'filters'].includes(key)) warnings.push(`Ignored unknown search field: ${key}`)
    if (isRecord(raw.filters)) for (const key of Object.keys(raw.filters)) if (!['shorts', 'live'].includes(key)) warnings.push(`Ignored unknown filter field: ${key}`)
    const filters = isRecord(raw.filters) ? { shorts: typeof raw.filters.shorts === 'boolean' ? raw.filters.shorts : undefined, live: typeof raw.filters.live === 'boolean' ? raw.filters.live : undefined } : undefined
    return { query: raw.query.trim(), filters }
  })
  return { version: 1, type: 'youtube_search', searches, warnings }
}

export function buildRecommendationPrompt(options: { preset: string; question?: string; count: number; duration: string; language: string; shorts: boolean; live: boolean; excludeWatched: boolean; currentVideo?: VideoRef; recentHistory?: VideoRef[] }): string {
  const context = options.currentVideo ? `Current video: ${options.currentVideo.title} (${options.currentVideo.videoId}) by ${options.currentVideo.channelTitle ?? 'unknown channel'}.` : ''
  const history = (options.recentHistory ?? []).slice(0, 20).map((video) => `- ${video.title} (${video.videoId})`).join('\n')
  return [
    'Recommend YouTube videos matching these requirements.', context,
    `Intent: ${options.preset}${options.question ? ` — ${options.question}` : ''}`,
    `Count: ${Math.min(20, Math.max(1, options.count))}; duration: ${options.duration}; language: ${options.language}; Shorts: ${options.shorts}; Live: ${options.live}; exclude watched: ${options.excludeWatched}.`,
    history ? `Recent history (optional context only):\n${history}` : '',
    'Return only one strict JSON code block using YTREC v1: {"version":1,"type":"youtube_recommendations","query":"...","items":[{"videoId":"11 chars","title":"...","channel":"...","reason":"...","priority":1}]}',
    'Do not include JavaScript, HTML, markdown outside the JSON code block, or unavailable/private videos.'
  ].filter(Boolean).join('\n\n')
}
