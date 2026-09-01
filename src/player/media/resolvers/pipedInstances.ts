const INSTANCE_LIST_URL = 'https://raw.githubusercontent.com/TeamPiped/documentation/refs/heads/main/content/docs/public-instances/index.md'

export const PIPED_BOOTSTRAP_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.tokhmi.xyz',
  'https://pipedapi.moomoo.me',
  'https://pipedapi.syncpundit.io',
] as const

export async function discoverPipedInstances(signal?: AbortSignal): Promise<string[]> {
  try {
    const response = await fetch(INSTANCE_LIST_URL, { signal, headers: { Accept: 'text/plain' } })
    if (!response.ok) return [...PIPED_BOOTSTRAP_INSTANCES]
    const discovered = parsePipedInstanceMarkdown(await response.text())
    return discovered.length ? discovered : [...PIPED_BOOTSTRAP_INSTANCES]
  } catch {
    if (signal?.aborted) throw new DOMException('Instance discovery aborted', 'AbortError')
    return [...PIPED_BOOTSTRAP_INSTANCES]
  }
}

export function parsePipedInstanceMarkdown(markdown: string): string[] {
  const seen = new Set<string>()
  const instances: string[] = []
  for (const line of markdown.split(/\r?\n/)) {
    const cells = line.split('|').map((cell) => cell.trim()).filter(Boolean)
    if (cells.length < 2) continue
    const candidate = cells[1]
    if (!/^https:\/\//i.test(candidate)) continue
    try {
      const normalized = new URL(candidate).toString().replace(/\/$/, '')
      if (!seen.has(normalized)) {
        seen.add(normalized)
        instances.push(normalized)
      }
    } catch {
      // Ignore malformed rows in the upstream markdown table.
    }
  }
  return instances
}
