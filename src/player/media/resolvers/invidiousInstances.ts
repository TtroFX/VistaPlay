const INSTANCE_LIST_URL = 'https://raw.githubusercontent.com/iv-org/documentation/master/docs/instances.md'

export const INVIDIOUS_BOOTSTRAP_INSTANCES = [
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
  'https://yt.chocolatemoo53.com',
  'https://invidious.tiekoetter.com',
] as const

export async function discoverInvidiousInstances(signal?: AbortSignal): Promise<string[]> {
  try {
    const response = await fetch(INSTANCE_LIST_URL, { signal, headers: { Accept: 'text/plain' } })
    if (!response.ok) return [...INVIDIOUS_BOOTSTRAP_INSTANCES]
    const discovered = parseInvidiousInstanceMarkdown(await response.text())
    return discovered.length ? discovered : [...INVIDIOUS_BOOTSTRAP_INSTANCES]
  } catch {
    if (signal?.aborted) throw new DOMException('Instance discovery aborted', 'AbortError')
    return [...INVIDIOUS_BOOTSTRAP_INSTANCES]
  }
}

export function parseInvidiousInstanceMarkdown(markdown: string): string[] {
  const seen = new Set<string>()
  const instances: string[] = []
  const linkPattern = /^\s*\*\s+\[[^\]]+\]\((https:\/\/[^)]+)\)/

  for (const line of markdown.split(/\r?\n/)) {
    const match = line.match(linkPattern)
    if (!match) continue
    try {
      const normalized = new URL(match[1]).toString().replace(/\/$/, '')
      if (!seen.has(normalized)) {
        seen.add(normalized)
        instances.push(normalized)
      }
    } catch {
      // Ignore malformed documentation rows.
    }
  }
  return instances
}
