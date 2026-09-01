export type PlaybackBackendId = 'none' | 'html-media'
export type PlaybackProvider = 'web' | 'local'
export type PlaybackStateName = 'idle' | 'loading' | 'playing' | 'paused' | 'buffering' | 'ended' | 'error'
export type PlaybackRateMode = 'native-rate' | 'unavailable'

export interface PlaybackCapabilities {
  backend: PlaybackBackendId
  label: string
  provider: PlaybackProvider | 'none'
  supportedRates: number[]
  maxContinuousRate: number
  canSeek: boolean
  canControlVolume: boolean
  rateMode: PlaybackRateMode
}

export interface PlaybackBackendSnapshot {
  ready: boolean
  state: PlaybackStateName
  position: number
  duration: number
  actualRate: number
  supportedRates: number[]
  muted: boolean
  volume: number
  buffered?: number
  error?: string
}

export interface PlaybackMediaSource {
  provider: PlaybackProvider
  src: string
  mimeType?: string
}

export type PlaybackMedia = PlaybackMediaSource

export interface PlaybackMountRequest {
  host: HTMLElement
  media: PlaybackMedia
  startSeconds: number
  desiredRate: number
}

export interface PlaybackBackend {
  readonly id: Exclude<PlaybackBackendId, 'none'>
  readonly snapshot: PlaybackBackendSnapshot
  getCapabilities(): PlaybackCapabilities
  subscribe(listener: (snapshot: PlaybackBackendSnapshot) => void): () => void
  mount(request: PlaybackMountRequest): Promise<void>
  destroy(): void
  play(): void
  pause(): void
  toggle(): void
  stop(): void
  seekTo(seconds: number): void
  setRate(rate: number): void
  toggleMute(): void
  setVolume(volume: number): void
}

export interface PlaybackSnapshot extends PlaybackBackendSnapshot {
  backend: PlaybackBackendId
  desiredRate: number
  capabilities: PlaybackCapabilities
}
