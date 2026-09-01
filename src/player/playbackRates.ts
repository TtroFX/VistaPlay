export const VISTAPLAY_PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4] as const
export const VISTAPLAY_STANDARD_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4] as const
export const REQUIRED_PLAYBACK_RATES = VISTAPLAY_STANDARD_RATES

export function isVistaPlayRate(rate: number): boolean {
  return VISTAPLAY_PLAYBACK_RATES.includes(rate as (typeof VISTAPLAY_PLAYBACK_RATES)[number])
}

export function resolveSupportedRate(desired: number, supported: readonly number[]): number {
  const rates = [...new Set(supported.filter((rate) => Number.isFinite(rate) && rate > 0))]
  if (!rates.length) return 1
  if (rates.includes(desired)) return desired
  return rates.sort((a, b) => Math.abs(a - desired) - Math.abs(b - desired) || a - b)[0]
}

export function nextSupportedRate(current: number, supported: readonly number[], mode: 'next' | 'maximum'): number {
  const rates = [...new Set(supported.filter((rate) => Number.isFinite(rate) && rate > 0))].sort((a, b) => a - b)
  if (!rates.length) return current
  if (mode === 'maximum') return rates.at(-1) ?? current
  return rates.find((rate) => rate > current) ?? rates.at(-1) ?? current
}
