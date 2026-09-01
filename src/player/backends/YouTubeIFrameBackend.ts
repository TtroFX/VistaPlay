import { recordDiagnostic } from '../../lib/diagnostics'
import { resolveSupportedRate } from '../playbackRates'
import type { PlaybackBackend, PlaybackBackendSnapshot, PlaybackCapabilities, PlaybackMountRequest, PlaybackStateName } from '../types'

export type YTPlayerState = -1 | 0 | 1 | 2 | 3 | 5

export interface YouTubePlayer {
  cueVideoById(id: string, startSeconds?: number): void
  loadVideoById(id: string, startSeconds?: number): void
  playVideo(): void
  pauseVideo(): void
  stopVideo(): void
  seekTo(seconds: number, allowSeekAhead?: boolean): void
  getCurrentTime(): number
  getDuration(): number
  getPlayerState(): YTPlayerState
  getPlaybackRate(): number
  setPlaybackRate(rate: number): void
  getAvailablePlaybackRates(): number[]
  isMuted(): boolean
  mute(): void
  unMute(): void
  getVolume(): number
  setVolume(volume: number): void
  destroy(): void
}

export interface YouTubeNamespace {
  Player: new (element: HTMLElement, options: Record<string, unknown>) => YouTubePlayer
  PlayerState: { ENDED: 0; PLAYING: 1; PAUSED: 2; BUFFERING: 3; CUED: 5 }
}

type YoutubeWindow = Window & typeof globalThis & {
  YT?: YouTubeNamespace
  onYouTubeIframeAPIReady?: () => void
}

const YOUTUBE_API_SRC = 'https://www.youtube.com/iframe_api'
let youtubeApiPromise: Promise<YouTubeNamespace> | undefined

function youtubeWindow(): YoutubeWindow {
  return window as YoutubeWindow
}

export function loadYouTubeApi(): Promise<YouTubeNamespace> {
  const target = youtubeWindow()
  if (target.YT?.Player) return Promise.resolve(target.YT)
  if (youtubeApiPromise) return youtubeApiPromise

  const pending = new Promise<YouTubeNamespace>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${YOUTUBE_API_SRC}"]`)
    const script = existing ?? document.createElement('script')
    const previous = target.onYouTubeIframeAPIReady
    let settled = false

    const cleanup = () => {
      window.clearTimeout(timeout)
      script.removeEventListener('error', onError)
      if (target.onYouTubeIframeAPIReady === onReady) target.onYouTubeIframeAPIReady = previous
    }
    const succeed = (namespace: YouTubeNamespace) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(namespace)
    }
    const fail = (message: string) => {
      if (settled) return
      settled = true
      cleanup()
      script.remove()
      reject(new Error(message))
    }
    function onError() { fail('YouTube Player API failed to load') }
    function onReady() {
      try { previous?.() }
      finally {
        if (target.YT?.Player) succeed(target.YT)
        else fail('YouTube Player API initialized without Player support')
      }
    }

    target.onYouTubeIframeAPIReady = onReady
    script.addEventListener('error', onError, { once: true })
    const timeout = window.setTimeout(() => fail('YouTube Player API timed out'), 15_000)
    if (!existing) {
      script.src = YOUTUBE_API_SRC
      script.async = true
      document.head.append(script)
    }
  })

  youtubeApiPromise = pending.catch((error: unknown) => {
    youtubeApiPromise = undefined
    throw error
  })
  return youtubeApiPromise
}

function stateName(value: YTPlayerState): PlaybackStateName {
  if (value === 0) return 'ended'
  if (value === 1) return 'playing'
  if (value === 2) return 'paused'
  if (value === 3) return 'buffering'
  if (value === 5) return 'cued'
  return 'idle'
}

export class YouTubeIFrameBackend implements PlaybackBackend {
  readonly id = 'youtube-iframe' as const
  private player?: YouTubePlayer
  private host?: HTMLElement
  private timer?: number
  private listeners = new Set<(snapshot: PlaybackBackendSnapshot) => void>()
  private requestedStart = 0
  private requestedRate = 1
  private optimisticVolume?: { value: number; until: number }
  private optimisticMuted?: { value: boolean; until: number }

  snapshot: PlaybackBackendSnapshot = {
    ready: false,
    state: 'idle',
    position: 0,
    duration: 0,
    actualRate: 1,
    supportedRates: [1],
    muted: false,
    volume: 100,
  }

  getCapabilities(): PlaybackCapabilities {
    const supportedRates = this.snapshot.supportedRates.length ? [...this.snapshot.supportedRates] : [1]
    return {
      backend: this.id,
      label: 'YouTube IFrame',
      provider: 'youtube',
      supportedRates,
      maxContinuousRate: Math.max(...supportedRates),
      canSeek: true,
      canControlVolume: true,
      rateMode: 'iframe-rate',
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
    if (request.media.provider !== 'youtube') throw new Error('YouTubeIFrameBackend requires a YouTube media source')
    this.requestedStart = request.startSeconds
    this.requestedRate = request.desiredRate

    if (this.player && this.host === request.host) {
      this.player.cueVideoById(request.media.id, request.startSeconds)
      this.emit({ state: 'cued', position: request.startSeconds, error: undefined })
      this.refreshCapabilities()
      this.setRate(resolveSupportedRate(this.requestedRate, this.snapshot.supportedRates))
      this.startPolling()
      return
    }

    this.releasePlayer()
    this.host = request.host
    this.emit({ ready: false, state: 'idle', position: request.startSeconds, duration: 0, actualRate: 1, supportedRates: [1], error: undefined })

    try {
      const YT = await loadYouTubeApi()
      this.player = new YT.Player(request.host, {
        videoId: request.media.id,
        width: '100%',
        height: '100%',
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          enablejsapi: 1,
          fs: 0,
          playsinline: 1,
          rel: 0,
          origin: window.location.origin,
          start: Math.floor(request.startSeconds),
        },
        events: {
          onReady: () => this.handleReady(),
          onStateChange: (event: { data: YTPlayerState }) => this.emit({ state: stateName(event.data) }),
          onPlaybackRateChange: () => this.poll(),
          onError: (event: { data: number }) => {
            recordDiagnostic('player', `YouTube Player error ${event.data}`)
            this.emit({ state: 'error', error: `YouTube Player error ${event.data}` })
          },
        },
      })
      this.startPolling()
    } catch (error) {
      recordDiagnostic('player', 'Embedded Player initialization failed')
      this.emit({ state: 'error', error: error instanceof Error ? error.message : 'Player unavailable' })
    }
  }

  private handleReady(): void {
    this.refreshCapabilities()
    const actualRate = resolveSupportedRate(this.requestedRate, this.snapshot.supportedRates)
    this.player?.setPlaybackRate(actualRate)
    if (this.requestedStart > 0) this.player?.seekTo(this.requestedStart, true)
    this.emit({
      ready: true,
      state: 'cued',
      duration: this.player?.getDuration() ?? 0,
      actualRate,
    })
  }

  private refreshCapabilities(): void {
    const rates = this.player?.getAvailablePlaybackRates() ?? [1]
    this.emit({ supportedRates: rates.length ? [...rates] : [1] })
  }

  private startPolling(): void {
    window.clearInterval(this.timer)
    this.timer = window.setInterval(() => this.poll(), 250)
  }

  private poll(): void {
    if (!this.player) return
    try {
      const now = performance.now()
      const actualVolume = this.player.getVolume()
      const actualMuted = this.player.isMuted()
      if (this.optimisticVolume && Math.abs(actualVolume - this.optimisticVolume.value) <= 1) this.optimisticVolume = undefined
      if (this.optimisticMuted && actualMuted === this.optimisticMuted.value) this.optimisticMuted = undefined
      const volume = this.optimisticVolume && this.optimisticVolume.until > now ? this.optimisticVolume.value : actualVolume
      const muted = this.optimisticMuted && this.optimisticMuted.until > now ? this.optimisticMuted.value : actualMuted
      if (this.optimisticVolume && this.optimisticVolume.until <= now) this.optimisticVolume = undefined
      if (this.optimisticMuted && this.optimisticMuted.until <= now) this.optimisticMuted = undefined
      const rates = this.player.getAvailablePlaybackRates()
      this.emit({
        position: this.player.getCurrentTime(),
        duration: this.player.getDuration(),
        actualRate: this.player.getPlaybackRate(),
        muted,
        volume,
        supportedRates: rates.length ? [...rates] : [1],
      })
    } catch { /* Player may be transitioning. */ }
  }

  play(): void { this.player?.playVideo() }
  pause(): void { this.player?.pauseVideo() }
  toggle(): void { if (this.snapshot.state === 'playing') this.pause(); else this.play() }

  stop(): void {
    window.clearInterval(this.timer)
    this.timer = undefined
    this.player?.stopVideo()
    this.emit({ state: 'idle', position: 0 })
  }

  seekTo(seconds: number): void {
    const target = Math.max(0, Math.min(seconds, this.snapshot.duration || seconds))
    this.player?.seekTo(target, true)
    this.emit({ position: target })
    this.poll()
  }

  setRate(rate: number): void {
    if (!Number.isFinite(rate) || !this.snapshot.supportedRates.includes(rate)) return
    this.requestedRate = rate
    this.player?.setPlaybackRate(rate)
  }

  toggleMute(): void {
    const target = !this.snapshot.muted
    this.optimisticMuted = { value: target, until: performance.now() + 700 }
    this.emit({ muted: target })
    if (target) this.player?.mute(); else this.player?.unMute()
    this.poll()
  }

  setVolume(volume: number): void {
    const value = Math.round(Math.max(0, Math.min(100, volume)))
    this.optimisticVolume = { value, until: performance.now() + 700 }
    this.emit({ volume: value })
    this.player?.setVolume(value)
    this.poll()
  }

  destroy(): void {
    this.releasePlayer()
    this.emit({ ready: false, state: 'idle', position: 0, duration: 0, actualRate: 1, supportedRates: [1] })
  }

  private releasePlayer(): void {
    window.clearInterval(this.timer)
    this.timer = undefined
    this.player?.destroy()
    this.player = undefined
    this.host = undefined
  }
}
