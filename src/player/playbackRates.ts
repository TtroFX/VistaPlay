export const VISTAPLAY_PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 6, 8] as const

export const REQUIRED_PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 6, 8] as const

export function isVistaPlayRate(rate: number): boolean {
  return VISTAPLAY_PLAYBACK_RATES.includes(rate as (typeof VISTAPLAY_PLAYBACK_RATES)[number])
}
