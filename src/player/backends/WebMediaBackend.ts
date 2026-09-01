import { isVistaPlayRate, VISTAPLAY_PLAYBACK_RATES } from '../playbackRates'
import type { PlaybackBackend, PlaybackBackendSnapshot, PlaybackCapabilities, PlaybackMountRequest, PlaybackStateName } from '../types'

export class WebMediaBackend implements PlaybackBackend {
  readonly id = 'web-media' as const
  private media?: HTMLMediaElement
  private listeners = new Set<(snapshot: PlaybackBackendSnapshot) => void>()
  private readonly mediaEvents = ['loadedmetadata', 'durationchange', 'timeupdate', 'ratechange', 'volumechange', 'play', 'pause', 'waiting', 'playing', 'ended', 'error'] as const

  snapshot: PlaybackBackendSnapshot = {
    ready: false,
    state: 'idle',
    position: 0,
    duration: 0,
    actualRate: 1,
    supportedRates: [...VISTAPLAY_PLAYBACK_RATES],
    muted: false,
    volume: 100,
  }

  getCapabilities(): PlaybackCapabilities {
    return {
      backend: this.id,
      label: 'VistaPlay Web Media',
      provider: 'web',
      supportedRates: [...VISTAPLAY_PLAYBACK_RATES],
      maxContinuousRate: 8,
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
    if (request.media.provider === 'youtube') throw new Error('WebMediaBackend requires a directly controllable HTMLMediaElement')
    this.detachMedia()
    this.media = request.media.element
    for (const event of this.mediaEvents) this.media.addEventListener(event, this.sync)
    if (request.startSeconds > 0 && Number.isFinite(request.startSeconds)) this.media.currentTime = request.startSeconds
    if (isVistaPlayRate(request.desiredRate)) this.media.playbackRate = request.desiredRate
    this.sync()
  }

  private readonly sync = (): void => {
    const media = this.media
    if (!media) return
    let state: PlaybackStateName = 'idle'
    if (media.error) state = 'error'
    else if (media.ended) state = 'ended'
    else if (!media.paused) state = media.readyState < HTMLMediaElement.HAVE_FUTURE_DATA ? 'buffering' : 'playing'
    else if (media.currentTime > 0 || media.readyState >= HTMLMediaElement.HAVE_METADATA) state = 'paused'
    this.emit({
      ready: media.readyState >= HTMLMediaElement.HAVE_METADATA,
      state,
      position: Number.isFinite(media.currentTime) ? media.currentTime : 0,
      duration: Number.isFinite(media.duration) ? media.duration : 0,
      actualRate: media.playbackRate,
      supportedRates: [...VISTAPLAY_PLAYBACK_RATES],
      muted: media.muted,
      volume: Math.round(media.volume * 100),
      error: media.error ? `Media error ${media.error.code}` : undefined,
    })
  }

  play(): void { void this.media?.play() }
  pause(): void { this.media?.pause() }
  toggle(): void { if (this.media?.paused) this.play(); else this.pause() }

  stop(): void {
    if (!this.media) return
    this.media.pause()
    this.media.currentTime = 0
    this.emit({ state: 'idle', position: 0 })
  }

  seekTo(seconds: number): void {
    if (!this.media) return
    this.media.currentTime = Math.max(0, Math.min(seconds, Number.isFinite(this.media.duration) ? this.media.duration : seconds))
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
    if (!this.media) return
    this.media.volume = Math.max(0, Math.min(1, volume / 100))
    this.sync()
  }

  destroy(): void {
    this.detachMedia()
    this.emit({ ready: false, state: 'idle', position: 0, duration: 0, actualRate: 1, muted: false, volume: 100 })
  }

  private detachMedia(): void {
    if (!this.media) return
    for (const event of this.mediaEvents) this.media.removeEventListener(event, this.sync)
    this.media = undefined
  }
}
