export function isCompleted(position: number, duration: number, watchTime: number): boolean {
  return duration > 0 && position >= duration * 0.9 && watchTime >= Math.min(30, duration * 0.25)
}

export function countsAsWatched(watchTime: number, duration: number): boolean {
  return watchTime >= Math.min(30, Math.max(5, duration * 0.1))
}

export function shouldPersistProgress(previouslyPersisted: boolean, watchTime: number): boolean {
  return previouslyPersisted || watchTime >= 10
}

export type PlaybackEndAction = 'repeat' | 'next' | 'stop'

export function resolvePlaybackEndAction(repeat: boolean, queueLength: number, continuousPlay: boolean): PlaybackEndAction {
  if (repeat) return 'repeat'
  if (continuousPlay && queueLength > 0) return 'next'
  return 'stop'
}
