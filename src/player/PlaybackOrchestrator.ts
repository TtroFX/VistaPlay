import { AndroidExtendedBackend, hasAndroidPlaybackBridge } from './backends/AndroidExtendedBackend'
import { WebMediaBackend } from './backends/WebMediaBackend'
import { YouTubeIFrameBackend } from './backends/YouTubeIFrameBackend'
import { isVistaPlayRate, resolveSupportedRate } from './playbackRates'
import type { PlaybackBackend, PlaybackBackendSnapshot, PlaybackCapabilities, PlaybackMedia, PlaybackSnapshot } from './types'

const EMPTY_CAPABILITIES: PlaybackCapabilities = {
  backend: 'none',
  label: 'Playback unavailable',
  provider: 'none',
  supportedRates: [1],
  maxContinuousRate: 1,
  canSeek: false,
  canControlVolume: false,
  rateMode: 'unavailable',
}

export class PlaybackOrchestrator extends EventTarget {
  private backend?: PlaybackBackend
  private unsubscribeBackend?: () => void
  private transientRate?: number
  private lastRequestedRate?: number

  private snapshotValue: PlaybackSnapshot = {
    backend: 'none',
    ready: false,
    state: 'idle',
    position: 0,
    duration: 0,
    desiredRate: 1,
    actualRate: 1,
    supportedRates: [1],
    muted: false,
    volume: 100,
    capabilities: EMPTY_CAPABILITIES,
  }

  get state(): PlaybackSnapshot { return this.snapshotValue }

  private emit(patch: Partial<PlaybackSnapshot> = {}): void {
    this.snapshotValue = { ...this.snapshotValue, ...patch }
    this.dispatchEvent(new CustomEvent<PlaybackSnapshot>('change', { detail: this.snapshotValue }))
  }

  private handleBackendSnapshot = (backendSnapshot: PlaybackBackendSnapshot): void => {
    if (!this.backend) return
    const capabilities = this.backend.getCapabilities()
    const previousRates = this.snapshotValue.supportedRates.join(',')
    const nextRates = capabilities.supportedRates.join(',')
    if (this.lastRequestedRate !== undefined && Math.abs(backendSnapshot.actualRate - this.lastRequestedRate) < 0.001) this.lastRequestedRate = undefined
    this.emit({
      ...backendSnapshot,
      backend: this.backend.id,
      supportedRates: [...capabilities.supportedRates],
      capabilities,
    })
    if (previousRates !== nextRates || this.lastRequestedRate === undefined) this.applyEffectiveRate()
  }

  async mountYoutube(host: HTMLElement, videoId: string, startSeconds = 0, desiredRate = 1): Promise<void> {
    this.transientRate = undefined
    this.lastRequestedRate = undefined
    if (isVistaPlayRate(desiredRate)) this.emit({ desiredRate })
    const backendId = hasAndroidPlaybackBridge() ? 'android-extended' : 'youtube-iframe'
    if (!this.backend || this.backend.id !== backendId) this.installBackend(backendId === 'android-extended' ? new AndroidExtendedBackend() : new YouTubeIFrameBackend())
    await this.backend.mount({ host, media: { provider: 'youtube', id: videoId }, startSeconds, desiredRate: this.snapshotValue.desiredRate })
    this.handleBackendSnapshot(this.backend.snapshot)
    this.applyEffectiveRate()
  }

  async mountMedia(host: HTMLElement, media: Extract<PlaybackMedia, { provider: 'web' | 'local' }>, startSeconds = 0, desiredRate = 1): Promise<void> {
    this.transientRate = undefined
    this.lastRequestedRate = undefined
    if (isVistaPlayRate(desiredRate)) this.emit({ desiredRate })
    if (!this.backend || this.backend.id !== 'web-media') this.installBackend(new WebMediaBackend())
    await this.backend.mount({ host, media, startSeconds, desiredRate: this.snapshotValue.desiredRate })
    this.handleBackendSnapshot(this.backend.snapshot)
    this.applyEffectiveRate()
  }

  private installBackend(backend: PlaybackBackend): void {
    this.unsubscribeBackend?.()
    this.backend?.destroy()
    this.backend = backend
    this.unsubscribeBackend = backend.subscribe(this.handleBackendSnapshot)
    const capabilities = backend.getCapabilities()
    this.emit({
      backend: backend.id,
      ready: false,
      state: 'idle',
      position: 0,
      duration: 0,
      actualRate: 1,
      supportedRates: [...capabilities.supportedRates],
      capabilities,
      error: undefined,
    })
  }

  setDesiredRate(rate: number): void {
    if (!isVistaPlayRate(rate)) return
    if (this.snapshotValue.desiredRate !== rate) this.emit({ desiredRate: rate })
    this.lastRequestedRate = undefined
    this.applyEffectiveRate()
  }

  setTemporaryRate(rate: number): void {
    if (!isVistaPlayRate(rate)) return
    this.transientRate = rate
    this.lastRequestedRate = undefined
    this.applyEffectiveRate()
  }

  clearTemporaryRate(restoreActualRate?: number): void {
    this.transientRate = undefined
    this.lastRequestedRate = undefined
    if (restoreActualRate !== undefined && this.snapshotValue.supportedRates.includes(restoreActualRate)) {
      this.requestRate(restoreActualRate)
      return
    }
    this.applyEffectiveRate()
  }

  private applyEffectiveRate(): void {
    if (!this.backend) return
    const requested = this.transientRate ?? this.snapshotValue.desiredRate
    const target = resolveSupportedRate(requested, this.snapshotValue.supportedRates)
    if (Math.abs(this.snapshotValue.actualRate - target) < 0.001) return
    this.requestRate(target)
  }

  private requestRate(rate: number): void {
    if (!this.backend || this.lastRequestedRate === rate) return
    this.lastRequestedRate = rate
    this.backend.setRate(rate)
  }

  play(): void { this.backend?.play() }
  pause(): void { this.backend?.pause() }
  toggle(): void { this.backend?.toggle() }
  seekTo(seconds: number): void { this.backend?.seekTo(seconds) }
  toggleMute(): void { this.backend?.toggleMute() }
  setVolume(volume: number): void { this.backend?.setVolume(volume) }

  stop(): void {
    this.transientRate = undefined
    this.lastRequestedRate = undefined
    this.backend?.stop()
  }

  prepareExternalNavigation(): void {
    if (this.snapshotValue.state === 'playing') this.pause()
    if (document.fullscreenElement && typeof document.exitFullscreen === 'function') void document.exitFullscreen().catch(() => undefined)
  }

  destroy(): void {
    this.unsubscribeBackend?.()
    this.unsubscribeBackend = undefined
    this.backend?.destroy()
    this.backend = undefined
    this.transientRate = undefined
    this.lastRequestedRate = undefined
    this.snapshotValue = { ...this.snapshotValue, backend: 'none', ready: false, state: 'idle', position: 0, duration: 0, actualRate: 1, supportedRates: [1], capabilities: EMPTY_CAPABILITIES }
    this.dispatchEvent(new CustomEvent<PlaybackSnapshot>('change', { detail: this.snapshotValue }))
  }
}

export const playbackOrchestrator = new PlaybackOrchestrator()
