import type { YouTubeNamespace } from './backends/YouTubeIFrameBackend'

declare global {
  interface Window {
    YT?: YouTubeNamespace
    onYouTubeIframeAPIReady?: () => void
  }
}

export { playbackOrchestrator as playerEngine } from './PlaybackOrchestrator'
export type { PlaybackSnapshot as PlayerSnapshot } from './types'
export { loadYouTubeApi } from './backends/YouTubeIFrameBackend'
export type { YouTubeNamespace, YouTubePlayer } from './backends/YouTubeIFrameBackend'
