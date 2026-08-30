import { recordDiagnostic } from '../lib/diagnostics'
import { resolvePlaybackRate } from '../lib/playerMath'

type YTPlayerState = -1 | 0 | 1 | 2 | 3 | 5

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

declare global {
  interface Window { YT?: YouTubeNamespace; onYouTubeIframeAPIReady?: () => void }
}

export interface PlayerSnapshot {
  videoId?: string
  ready: boolean
  state: 'idle' | 'cued' | 'playing' | 'paused' | 'buffering' | 'ended' | 'error'
  position: number
  duration: number
  rate: number
  availableRates: number[]
  muted: boolean
  volume: number
  error?: string
}

export function loadYouTubeApi(): Promise<YouTubeNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://www.youtube.com/iframe_api"]')
    const previous = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => { previous?.(); if (window.YT) resolve(window.YT) }
    if (!existing) {
      const script = document.createElement('script')
      script.src = 'https://www.youtube.com/iframe_api'
      script.async = true
      script.onerror = () => reject(new Error('YouTube Player API failed to load'))
      document.head.append(script)
    }
    window.setTimeout(() => { if (!window.YT?.Player) reject(new Error('YouTube Player API timed out')) }, 15000)
  })
}

class PlayerEngine extends EventTarget {
  private player?: YouTubePlayer
  private host?: HTMLElement
  private timer?: number
  private snapshot: PlayerSnapshot = { ready: false, state: 'idle', position: 0, duration: 0, rate: 1, availableRates: [1], muted: false, volume: 100 }
  private requestedStart = 0
  private preferredRate = 1

  get state(): PlayerSnapshot { return this.snapshot }

  private emit(patch: Partial<PlayerSnapshot> = {}): void {
    this.snapshot = { ...this.snapshot, ...patch }
    this.dispatchEvent(new CustomEvent<PlayerSnapshot>('change', { detail: this.snapshot }))
  }

  async mount(host: HTMLElement, videoId: string, startSeconds = 0, preferredRate = 1): Promise<void> {
    this.requestedStart = startSeconds
    this.preferredRate = preferredRate
    if (this.player && this.host === host) {
      this.cue(videoId, startSeconds, preferredRate)
      this.startPolling()
      return
    }
    this.player?.destroy()
    this.host = host
    this.emit({ videoId, ready: false, state: 'idle', error: undefined, position: startSeconds })
    try {
      const YT = await loadYouTubeApi()
      this.player = new YT.Player(host, {
        videoId,
        width: '100%', height: '100%',
        playerVars: { autoplay: 0, controls: 1, enablejsapi: 1, playsinline: 1, rel: 0, origin: window.location.origin, start: Math.floor(startSeconds) },
        events: {
          onReady: () => this.handleReady(),
          onStateChange: (event: { data: YTPlayerState }) => this.handleState(event.data),
          onPlaybackRateChange: () => this.poll(),
          onError: (event: { data: number }) => { recordDiagnostic('player', `YouTube Player error ${event.data}`); this.emit({ state: 'error', error: `YouTube Player error ${event.data}` }) }
        }
      })
      this.startPolling()
    } catch (error) {
      recordDiagnostic('player', 'Embedded Player initialization failed')
      this.emit({ state: 'error', error: error instanceof Error ? error.message : 'Player unavailable' })
    }
  }

  private handleReady(): void {
    const available = this.player?.getAvailablePlaybackRates() ?? [1]
    const rate = resolvePlaybackRate(this.preferredRate, available)
    this.player?.setPlaybackRate(rate)
    if (this.requestedStart > 0) this.player?.seekTo(this.requestedStart, true)
    this.emit({ ready: true, availableRates: available, rate, state: 'cued', duration: this.player?.getDuration() ?? 0 })
  }

  private handleState(value: YTPlayerState): void {
    const state = value === 0 ? 'ended' : value === 1 ? 'playing' : value === 2 ? 'paused' : value === 3 ? 'buffering' : value === 5 ? 'cued' : 'idle'
    this.emit({ state })
  }

  private startPolling(): void {
    window.clearInterval(this.timer)
    this.timer = window.setInterval(() => this.poll(), 250)
  }

  private poll(): void {
    if (!this.player) return
    try {
      this.emit({ position: this.player.getCurrentTime(), duration: this.player.getDuration(), rate: this.player.getPlaybackRate(), muted: this.player.isMuted(), volume: this.player.getVolume(), availableRates: this.player.getAvailablePlaybackRates() })
    } catch { /* Player may be transitioning. */ }
  }

  cue(videoId: string, startSeconds = 0, preferredRate = 1): void {
    this.requestedStart = startSeconds
    this.preferredRate = preferredRate
    this.player?.cueVideoById(videoId, startSeconds)
    this.emit({ videoId, position: startSeconds, state: 'cued', error: undefined })
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
  seekTo(seconds: number): void { this.player?.seekTo(Math.max(0, Math.min(seconds, this.snapshot.duration || seconds)), true); this.poll() }
  seekBy(seconds: number): void { this.seekTo(this.snapshot.position + seconds) }
  setRate(rate: number): void { if (this.snapshot.availableRates.includes(rate)) this.player?.setPlaybackRate(rate) }
  toggleMute(): void { if (this.snapshot.muted) this.player?.unMute(); else this.player?.mute(); this.poll() }
  setVolume(volume: number): void { this.player?.setVolume(Math.max(0, Math.min(100, volume))); this.poll() }
}

export const playerEngine = new PlayerEngine()
