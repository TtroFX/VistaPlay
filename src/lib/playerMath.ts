export function resolvePlaybackRate(preferred: number, available: number[]): number {
  if (!available.length) return 1
  if (available.includes(preferred)) return preferred
  return [...available].sort((a, b) => Math.abs(a - preferred) - Math.abs(b - preferred) || a - b)[0]
}

export function nextPlaybackRate(current: number, available: number[], mode: 'next' | 'maximum'): number {
  const sorted = [...available].sort((a, b) => a - b)
  if (!sorted.length) return current
  if (mode === 'maximum') return sorted.at(-1) ?? current
  return sorted.find((rate) => rate > current) ?? sorted.at(-1) ?? current
}

export function isCompleted(position: number, duration: number, watchTime: number): boolean {
  return duration > 0 && position >= duration * 0.9 && watchTime >= Math.min(30, duration * 0.25)
}

export function countsAsWatched(watchTime: number, duration: number): boolean {
  return watchTime >= Math.min(30, Math.max(5, duration * 0.1))
}

export type PlaybackEndAction = 'repeat' | 'next' | 'stop'

export function resolvePlaybackEndAction(repeat: boolean, queueLength: number, continuousPlay: boolean): PlaybackEndAction {
  if (repeat) return 'repeat'
  if (continuousPlay && queueLength > 0) return 'next'
  return 'stop'
}
