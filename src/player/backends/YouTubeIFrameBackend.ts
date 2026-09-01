import { recordDiagnostic } from '../../lib/diagnostics'
import { resolveSupportedRate, VISTAPLAY_STANDARD_RATES } from '../playbackRates'
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

type RateProbeDelay = (milliseconds: number) => Promise<void>

const YOUTUBE_API_SRC = 'https://www.youtube.com/iframe_api'
const EXTENDED_RATE_PROBE_CANDIDATES = VISTAPLAY_STANDARD_RATES.filter((rate) => rate > 2)
const RATE_PROBE_SETTLE_MS = 35
const RATE_PROBE_ATTEMPTS = 3
const VIDEO_CUE_SETTLE_MS = 40
const VIDEO_CUE_ATTEMPTS = 15
let youtubeApiPromise: Promise<YouTubeNamespace> | undefined

function youtubeWindow(): YoutubeWindow {
  return window as YoutubeWindow
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds))
}

function sameRate(left: number, right: number): boolean {
  return Math.abs(left - right) < 0.001
}

function normalizeRates(rates: readonly number[]): number[] {
  return [...new Set(rates.filter((rate) => Number.isFinite(rate) && rate > 0))].sort((a, b) => a - b)
}

/**
 * The IFrame API documents setPlaybackRate as a suggestion and explicitly requires
 * clients to observe the actual rate. VistaPlay therefore probes only its own >2x
 * standard candidates and promotes a rate when getPlaybackRate confirms the exact
 * value. Unsupported suggestions that YouTube rounds toward 1x are never promoted.
 */
export async function probeYouTubePlaybackRates(
  player: YouTubePlayer,
  advertisedRates: readonly number[] = player.getAvailablePlaybackRates(),
  delay: RateProbeDelay = wait,
): Promise<number[]> {
  const supported = new Set(normalizeRates(advertisedRates))
  const restoreRate = player.getPlaybackRate()

  try {
    for (const candidate of EXTENDED_RATE_PROBE_CANDIDATES) {
      if (supported.has(candidate)) continue
      player.setPlaybackRate(candidate)
      let actualRate = player.getPlaybackRate()
      for (let attempt = 0; attempt < RATE_PROBE_ATTEMPTS && !sameRate(actualRate, candidate); attempt += 1) {
        await delay(RATE_PROBE_SETTLE_MS)
        actualRate = player.getPlaybackRate()
      }
      if (sameRate(actualRate, candidate)) supported.add(candidate)
    }
  } finally {
    try { player.setPlaybackRate(restoreRate) }
    catch { /* Player may have been replaced while probing. */ }
  }

  return normalizeRates([...supported])
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
  private probingRates = false
  private generation = 0

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
    const maximum = Math.max(...supportedRates)
    return {
      backend: this.id,
      label: maximum > 2 ? 'YouTube IFrame · Extended rate verified' : 'YouTube IFrame',
      provider: 'youtube',
      supportedRates,
      maxContinuousRate: maximum,
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
    const generation = ++this.generation

    if (this.player && this.host === request.host) {
      window.clearInterval(this.timer)
      this.timer = undefined
      this.player.cueVideoById(request.media.id, request.startSeconds)
      this.emit({ ready: false, state: 'cued', position: request.startSeconds, duration: 0, actualRate: 1, supportedRates: [1], error: undefined })
      await this.waitForCuedVideo(generation)
      await this.prepareReadyPlayer(generation)
      return
    }

    this.releasePlayer()
    this.host = request.host
    this.emit({ ready: false, state: 'idle', position: request.startSeconds, duration: 0, actualRate: 1, supportedRates: [1], error: undefined })

    try {
      const YT = await loadYouTubeApi()
      if (generation !== this.generation) return
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
          onReady: () => { void this.prepareReadyPlayer(generation) },
          onStateChange: (event: { data: YTPlayerState }) => this.emit({ state: stateName(event.data) }),
          onPlaybackRateChange: () => { if (!this.probingRates) this.poll() },
          onError: (event: { data: number }) => {
            recordDiagnostic('player', `YouTube Player error ${event.data}`)
            this.emit({ state: 'error', error: `YouTube Player error ${event.data}` })
          },
        },
      })
    } catch (error) {
      recordDiagnostic('player', 'Embedded Player initialization failed')
      this.emit({ state: 'error', error: error instanceof Error ? error.message : 'Player unavailable' })
    }
  }

  private async waitForCuedVideo(generation: number): Promise<void> {
    const player = this.player
    if (!player) return
    for (let attempt = 0; attempt < VIDEO_CUE_ATTEMPTS; attempt += 1) {
      if (generation !== this.generation || player !== this.player) return
      if (player.getPlayerState() === 5 || player.getDuration() > 0) return
      await wait(VIDEO_CUE_SETTLE_MS)
    }
  }

  private async prepareReadyPlayer(generation: number): Promise<void> {
    const player = this.player
    if (!player || generation !== this.generation) return

    let supportedRates = normalizeRates(player.getAvailablePlaybackRates())
    if (player.getPlayerState() !== 1) {
      this.probingRates = true
      try {
        supportedRates = await probeYouTubePlaybackRates(player, supportedRates)
      } catch {
        recordDiagnostic('player', 'YouTube extended playback-rate probe failed')
      } finally {
        this.probingRates = false
      }
    }
    if (player !== this.player || generation !== this.generation) return

    const targetRate = resolveSupportedRate(this.requestedRate, supportedRates)
    player.setPlaybackRate(targetRate)
    if (this.requestedStart > 0) player.seekTo(this.requestedStart, true)
    this.emit({
      ready: true,
      state: stateName(player.getPlayerState()),
      duration: player.getDuration(),
      position: player.getCurrentTime(),
      actualRate: player.getPlaybackRate(),
      supportedRates: supportedRates.length ? supportedRates : [1],
    })
    this.startPolling()
  }

  private startPolling(): void {
    window.clearInterval(this.timer)
    this.timer = window.setInterval(() => this.poll(), 250)
  }

  private poll(): void {
    if (!this.player || this.probingRates) return
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
      const advertisedRates = this.player.getAvailablePlaybackRates()
      const actualRate = this.player.getPlaybackRate()
      const supportedRates = new Set(this.snapshot.supportedRates)
      for (const rate of advertisedRates) supportedRates.add(rate)
      if (VISTAPLAY_STANDARD_RATES.includes(actualRate as (typeof VISTAPLAY_STANDARD_RATES)[number])) supportedRates.add(actualRate)
      this.emit({
        position: this.player.getCurrentTime(),
        duration: this.player.getDuration(),
        actualRate,
        muted,
        volume,
        supportedRates: normalizeRates([...supportedRates]),
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
    this.generation += 1
    this.releasePlayer()
    this.emit({ ready: false, state: 'idle', position: 0, duration: 0, actualRate: 1, supportedRates: [1] })
  }

  private releasePlayer(): void {
    window.clearInterval(this.timer)
    this.timer = undefined
    this.probingRates = false
    this.player?.destroy()
    this.player = undefined
    this.host = undefined
  }
}
