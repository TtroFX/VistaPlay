import type { YouTubeNamespace } from './backends/YouTubeIFrameBackend'

type NativeBridgeMessageEvent = { data: string }
interface NativeMessageBridge {
  postMessage(message: string): void
  onmessage: ((event: NativeBridgeMessageEvent) => void) | null
}

declare global {
  interface Window {
    YT?: YouTubeNamespace
    onYouTubeIframeAPIReady?: () => void
    VistaPlayNative?: NativeMessageBridge
  }
}

export { playbackOrchestrator as playerEngine } from './PlaybackOrchestrator'
export type { PlaybackSnapshot as PlayerSnapshot } from './types'
export { loadYouTubeApi } from './backends/YouTubeIFrameBackend'
export type { YouTubeNamespace, YouTubePlayer } from './backends/YouTubeIFrameBackend'
