import { isVistaPlayRate, VISTAPLAY_PLAYBACK_RATES } from '../playbackRates'
import type { PlaybackBackend, PlaybackBackendSnapshot, PlaybackCapabilities, PlaybackMountRequest, PlaybackStateName } from '../types'

export class HTMLMediaBackend implements PlaybackBackend {
  readonly id = 'html-media' as const
  private media?: HTMLVideoElement
  private pendingStartSeconds = 0
  private listeners = new Set<(snapshot: PlaybackBackendSnapshot) => void>()
  private readonly mediaEvents = [
    'loadstart', 'loadedmetadata', 'canplay', 'durationchange', 'timeupdate', 'ratechange',
    'volumechange', 'play', 'pause', 'waiting', 'playing', 'ended', 'error', 'progress', 'emptied',
  ] as const

  snapshot: PlaybackBackendSnapshot = {
    ready: false,
    state: 'idle',
    position: 0,
    duration: 0,
    actualRate: 1,
    supportedRates: [...VISTAPLAY_PLAYBACK_RATES],
    muted: false,
    volume: 100,
    buffered: 0,
  }

  getCapabilities(): PlaybackCapabilities {
    return {
      backend: this.id,
      label: 'VistaPlay HTML Media',
      provider: 'web',
      supportedRates: [...VISTAPLAY_PLAYBACK_RATES],
      maxContinuousRate: 4,
      canSeek: true,
      canControlVolume: true,
      rateMode: 'native-rate',
    }
  }

  subscribe(listener: (snapshot: PlaybackBackendSnapshot) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(patch: Partial<PlaybackBackendSnapshot> = {}): void {
    this.snapshot = { ...this.snapshot, ...patch }
    for (const listener of this.listeners) listener(this.snapshot)
  }

  async mount(request: PlaybackMountRequest): Promise<void> {
    this.detachMedia()
    const media = document.createElement('video')
    media.className = 'vistaplay-media'
    media.playsInline = true
    media.preload = 'metadata'
    media.controls = false
    media.src = request.media.src
    this.pendingStartSeconds = Number.isFinite(request.startSeconds) ? Math.max(0, request.startSeconds) : 0
    if (isVistaPlayRate(request.desiredRate)) media.playbackRate = request.desiredRate
    for (const event of this.mediaEvents) media.addEventListener(event, this.sync)
    this.media = media
    request.host.replaceChildren(media)
    this.emit({
      ready: false,
      state: 'loading',
      position: 0,
      duration: 0,
      actualRate: media.playbackRate,
      supportedRates: [...VISTAPLAY_PLAYBACK_RATES],
      muted: media.muted,
      volume: Math.round(media.volume * 100),
      buffered: 0,
      error: undefined,
    })
    media.load()
  }

  private readonly sync = (): void => {
    const media = this.media
    if (!media) return
    if (media.readyState >= HTMLMediaElement.HAVE_METADATA && this.pendingStartSeconds > 0) {
      const target = Number.isFinite(media.duration) ? Math.min(this.pendingStartSeconds, media.duration) : this.pendingStartSeconds
      media.currentTime = target
      this.pendingStartSeconds = 0
    }

    let state: PlaybackStateName = 'loading'
    if (media.error) state = 'error'
    else if (media.ended) state = 'ended'
    else if (!media.paused) state = media.readyState < HTMLMediaElement.HAVE_FUTURE_DATA ? 'buffering' : 'playing'
    else if (media.readyState >= HTMLMediaElement.HAVE_METADATA) state = 'paused'

    const buffered = media.buffered.length ? media.buffered.end(media.buffered.length - 1) : 0
    this.emit({
      ready: media.readyState >= HTMLMediaElement.HAVE_METADATA,
      state,
      position: Number.isFinite(media.currentTime) ? media.currentTime : 0,
      duration: Number.isFinite(media.duration) ? media.duration : 0,
      actualRate: media.playbackRate,
      supportedRates: [...VISTAPLAY_PLAYBACK_RATES],
      muted: media.muted,
      volume: Math.round(media.volume * 100),
      buffered: Number.isFinite(buffered) ? buffered : 0,
      error: media.error ? `Media error ${media.error.code}` : undefined,
    })
  }

  play(): void {
    const media = this.media
    if (!media) return
    void media.play().catch((error: unknown) => {
      this.emit({ state: 'error', error: error instanceof Error ? error.message : 'Media playback failed' })
    })
  }

  pause(): void { this.media?.pause() }
  toggle(): void { if (this.media?.paused) this.play(); else this.pause() }

  stop(): void {
    if (!this.media) return
    this.media.pause()
    this.media.currentTime = 0
    this.emit({ state: 'idle', position: 0 })
  }

  seekTo(seconds: number): void {
    if (!this.media || !Number.isFinite(seconds)) return
    const max = Number.isFinite(this.media.duration) ? this.media.duration : seconds
    this.media.currentTime = Math.max(0, Math.min(seconds, max))
    this.sync()
  }

  setRate(rate: number): void {
    if (!this.media || !isVistaPlayRate(rate)) return
    this.media.playbackRate = rate
    this.sync()
  }

  toggleMute(): void {
    if (!this.media) return
    this.media.muted = !this.media.muted
    this.sync()
  }

  setVolume(volume: number): void {
    if (!this.media || !Number.isFinite(volume)) return
    this.media.volume = Math.max(0, Math.min(1, volume / 100))
    this.sync()
  }

  destroy(): void {
    this.detachMedia()
    this.emit({ ready: false, state: 'idle', position: 0, duration: 0, actualRate: 1, muted: false, volume: 100, buffered: 0, error: undefined })
  }

  private detachMedia(): void {
    const media = this.media
    if (!media) return
    for (const event of this.mediaEvents) media.removeEventListener(event, this.sync)
    media.pause()
    media.removeAttribute('src')
    media.load()
    media.remove()
    this.media = undefined
    this.pendingStartSeconds = 0
  }
}
