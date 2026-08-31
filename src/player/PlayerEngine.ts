import { recordDiagnostic } from '../lib/diagnostics'
import { resolvePlaybackRate } from '../lib/playerMath'
import { isVistaPlayRate, VISTAPLAY_PLAYBACK_RATES } from './playbackRates'

type YTPlayerState = -1 | 0 | 1 | 2 | 3 | 5

type BridgeMessageEvent = { data: string }
interface WebViewMessageBridge {
  postMessage(message: string): void
  onmessage: ((event: BridgeMessageEvent) => void) | null
}

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
  interface Window {
    YT?: YouTubeNamespace
    onYouTubeIframeAPIReady?: () => void
    VistaPlayPlayback?: WebViewMessageBridge
    VistaPlayNative?: WebViewMessageBridge
  }
}

const YOUTUBE_API_SRC = 'https://www.youtube.com/iframe_api'
let youtubeApiPromise: Promise<YouTubeNamespace> | undefined

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
  playbackBackend: 'youtube-iframe' | 'android-media'
  error?: string
}

export function loadYouTubeApi(): Promise<YouTubeNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (youtubeApiPromise) return youtubeApiPromise

  const pending = new Promise<YouTubeNamespace>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${YOUTUBE_API_SRC}"]`)
    const script = existing ?? document.createElement('script')
    const previous = window.onYouTubeIframeAPIReady
    let settled = false

    const cleanup = () => {
      window.clearTimeout(timeout)
      script.removeEventListener('error', onError)
      if (window.onYouTubeIframeAPIReady === onReady) window.onYouTubeIframeAPIReady = previous
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
        if (window.YT?.Player) succeed(window.YT)
        else fail('YouTube Player API initialized without Player support')
      }
    }

    window.onYouTubeIframeAPIReady = onReady
    script.addEventListener('error', onError, { once: true })
    const timeout = window.setTimeout(() => fail('YouTube Player API timed out'), 15000)
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

class PlayerEngine extends EventTarget {
  private player?: YouTubePlayer
  private host?: HTMLElement
  private timer?: number
  private snapshot: PlayerSnapshot = {
    ready: false,
    state: 'idle',
    position: 0,
    duration: 0,
    rate: 1,
    availableRates: [1],
    muted: false,
    volume: 100,
    playbackBackend: 'youtube-iframe',
  }
  private requestedStart = 0
  private preferredRate = 1
  private optimisticVolume?: { value: number; until: number }
  private optimisticMuted?: { value: boolean; until: number }
  private bridge?: WebViewMessageBridge

  get state(): PlayerSnapshot { return this.snapshot }

  private emit(patch: Partial<PlayerSnapshot> = {}): void {
    this.snapshot = { ...this.snapshot, ...patch }
    this.dispatchEvent(new CustomEvent<PlayerSnapshot>('change', { detail: this.snapshot }))
  }

  private connectAndroidBridge(): boolean {
    const bridge = window.VistaPlayPlayback
    if (!bridge) {
      this.bridge = undefined
      return false
    }
    if (this.bridge !== bridge) {
      this.bridge = bridge
      bridge.onmessage = (event) => this.handleBridgeMessage(event.data)
      this.postBridge({ type: 'client:hello' })
    }
    return true
  }

  private postBridge(message: Record<string, unknown>): void {
    try { this.bridge?.postMessage(JSON.stringify(message)) }
    catch { recordDiagnostic('player', 'Android playback bridge message failed') }
  }

  private handleBridgeMessage(raw: string): void {
    try {
      const message = JSON.parse(raw) as { type?: string; rate?: number }
      if (message.type === 'native:capabilities') {
        this.emit({ playbackBackend: 'android-media', availableRates: [...VISTAPLAY_PLAYBACK_RATES] })
        this.postBridge({ type: 'client:setRate', rate: this.preferredRate })
      } else if (message.type === 'agent:ready') {
        this.postBridge({ type: 'client:setRate', rate: this.preferredRate })
      } else if (message.type === 'agent:state' && typeof message.rate === 'number' && Number.isFinite(message.rate)) {
        this.emit({ playbackBackend: 'android-media', availableRates: [...VISTAPLAY_PLAYBACK_RATES], rate: message.rate })
      }
    } catch { /* Ignore malformed native messages. */ }
  }

  async mount(host: HTMLElement, videoId: string, startSeconds = 0, preferredRate = 1): Promise<void> {
    this.requestedStart = startSeconds
    this.preferredRate = preferredRate
    const android = this.connectAndroidBridge()
    if (this.player && this.host === host) {
      this.cue(videoId, startSeconds, preferredRate)
      this.startPolling()
      return
    }
    this.player?.destroy()
    this.host = host
    this.emit({
      videoId,
      ready: false,
      state: 'idle',
      error: undefined,
      position: startSeconds,
      playbackBackend: android ? 'android-media' : 'youtube-iframe',
      availableRates: android ? [...VISTAPLAY_PLAYBACK_RATES] : [1],
    })
    try {
      const YT = await loadYouTubeApi()
      this.player = new YT.Player(host, {
        videoId,
        width: '100%', height: '100%',
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          enablejsapi: 1,
          fs: 0,
          playsinline: 1,
          rel: 0,
          origin: window.location.origin,
          start: Math.floor(startSeconds),
        },
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
    const iframeRates = this.player?.getAvailablePlaybackRates() ?? [1]
    const android = this.connectAndroidBridge()
    if (android) {
      const fallbackRate = resolvePlaybackRate(this.preferredRate, iframeRates)
      this.player?.setPlaybackRate(fallbackRate)
      this.postBridge({ type: 'client:setRate', rate: this.preferredRate })
      this.emit({ ready: true, availableRates: [...VISTAPLAY_PLAYBACK_RATES], rate: this.preferredRate, playbackBackend: 'android-media', state: 'cued', duration: this.player?.getDuration() ?? 0 })
    } else {
      const rate = resolvePlaybackRate(this.preferredRate, iframeRates)
      this.player?.setPlaybackRate(rate)
      this.emit({ ready: true, availableRates: iframeRates, rate, playbackBackend: 'youtube-iframe', state: 'cued', duration: this.player?.getDuration() ?? 0 })
    }
    if (this.requestedStart > 0) this.player?.seekTo(this.requestedStart, true)
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
      const now = performance.now()
      const actualVolume = this.player.getVolume()
      const actualMuted = this.player.isMuted()
      if (this.optimisticVolume && Math.abs(actualVolume - this.optimisticVolume.value) <= 1) this.optimisticVolume = undefined
      if (this.optimisticMuted && actualMuted === this.optimisticMuted.value) this.optimisticMuted = undefined
      const volume = this.optimisticVolume && this.optimisticVolume.until > now ? this.optimisticVolume.value : actualVolume
      const muted = this.optimisticMuted && this.optimisticMuted.until > now ? this.optimisticMuted.value : actualMuted
      if (this.optimisticVolume && this.optimisticVolume.until <= now) this.optimisticVolume = undefined
      if (this.optimisticMuted && this.optimisticMuted.until <= now) this.optimisticMuted = undefined
      const android = this.connectAndroidBridge()
      const iframeRates = this.player.getAvailablePlaybackRates()
      this.emit({
        position: this.player.getCurrentTime(),
        duration: this.player.getDuration(),
        ...(android ? {} : { rate: this.player.getPlaybackRate() }),
        muted,
        volume,
        availableRates: android ? [...VISTAPLAY_PLAYBACK_RATES] : iframeRates,
        playbackBackend: android ? 'android-media' : 'youtube-iframe',
      })
    } catch { /* Player may be transitioning. */ }
  }

  cue(videoId: string, startSeconds = 0, preferredRate = 1): void {
    this.requestedStart = startSeconds
    this.preferredRate = preferredRate
    this.player?.cueVideoById(videoId, startSeconds)
    if (this.connectAndroidBridge()) this.postBridge({ type: 'client:setRate', rate: preferredRate })
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
  setRate(rate: number): void {
    if (!Number.isFinite(rate)) return
    const android = this.connectAndroidBridge()
    if (android) {
      if (!isVistaPlayRate(rate)) return
      this.preferredRate = rate
      this.emit({ rate, availableRates: [...VISTAPLAY_PLAYBACK_RATES], playbackBackend: 'android-media' })
      const iframeRates = this.player?.getAvailablePlaybackRates() ?? [1]
      if (iframeRates.includes(rate)) this.player?.setPlaybackRate(rate)
      this.postBridge({ type: 'client:setRate', rate })
      return
    }
    if (!this.snapshot.availableRates.includes(rate)) return
    this.preferredRate = rate
    this.player?.setPlaybackRate(rate)
    this.emit({ rate })
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
  prepareExternalNavigation(): void {
    if (this.snapshot.state === 'playing') this.pause()
    if (document.fullscreenElement && typeof document.exitFullscreen === 'function') void document.exitFullscreen().catch(() => undefined)
  }
}

export const playerEngine = new PlayerEngine()
