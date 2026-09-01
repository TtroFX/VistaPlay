import { recordDiagnostic } from '../../lib/diagnostics'
import { isVistaPlayRate, resolveSupportedRate, VISTAPLAY_PLAYBACK_RATES } from '../playbackRates'
import type { PlaybackBackend, PlaybackBackendSnapshot, PlaybackCapabilities, PlaybackMountRequest } from '../types'
import { YouTubeIFrameBackend } from './YouTubeIFrameBackend'

type BridgeMessageEvent = { data: string }
interface WebViewMessageBridge {
  postMessage(message: string): void
  onmessage: ((event: BridgeMessageEvent) => void) | null
}
type PlaybackBridgeWindow = Window & typeof globalThis & { VistaPlayPlayback?: WebViewMessageBridge }

function bridgeWindow(): PlaybackBridgeWindow {
  return window as PlaybackBridgeWindow
}

export function hasAndroidPlaybackBridge(): boolean {
  return Boolean(bridgeWindow().VistaPlayPlayback)
}

export class AndroidExtendedBackend implements PlaybackBackend {
  readonly id = 'android-extended' as const
  private readonly delegate = new YouTubeIFrameBackend()
  private readonly listeners = new Set<(snapshot: PlaybackBackendSnapshot) => void>()
  private unsubscribeDelegate?: () => void
  private bridge?: WebViewMessageBridge
  private agentReady = false
  private requestedRate = 1
  private lastAgentRate?: number

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

  constructor() {
    this.unsubscribeDelegate = this.delegate.subscribe((snapshot) => this.handleDelegateSnapshot(snapshot))
  }

  getCapabilities(): PlaybackCapabilities {
    const supportedRates = this.agentReady ? [...VISTAPLAY_PLAYBACK_RATES] : [...this.delegate.getCapabilities().supportedRates]
    return {
      backend: this.id,
      label: this.agentReady ? 'VistaPlay Extended' : 'VistaPlay Extended（初期化中）',
      provider: 'youtube',
      supportedRates,
      maxContinuousRate: Math.max(...supportedRates),
      canSeek: true,
      canControlVolume: true,
      rateMode: this.agentReady ? 'native-rate' : 'iframe-rate',
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

  private handleDelegateSnapshot(snapshot: PlaybackBackendSnapshot): void {
    const supportedRates = this.agentReady ? [...VISTAPLAY_PLAYBACK_RATES] : [...snapshot.supportedRates]
    this.emit({
      ...snapshot,
      actualRate: this.agentReady && this.lastAgentRate !== undefined ? this.lastAgentRate : snapshot.actualRate,
      supportedRates,
    })
  }

  private connectBridge(): boolean {
    const bridge = bridgeWindow().VistaPlayPlayback
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
      const message = JSON.parse(raw) as { type?: string; rate?: number; extendedPlayback?: boolean }
      if (message.type === 'native:capabilities' && message.extendedPlayback) {
        this.postBridge({ type: 'client:setRate', rate: this.requestedRate })
        return
      }
      if (message.type === 'agent:ready') {
        this.postBridge({ type: 'client:setRate', rate: this.requestedRate })
        return
      }
      if (message.type === 'agent:state' && typeof message.rate === 'number' && Number.isFinite(message.rate)) {
        this.agentReady = true
        this.lastAgentRate = message.rate
        this.emit({ actualRate: message.rate, supportedRates: [...VISTAPLAY_PLAYBACK_RATES] })
      }
    } catch { /* Ignore malformed native messages. */ }
  }

  async mount(request: PlaybackMountRequest): Promise<void> {
    if (request.media.provider !== 'youtube') throw new Error('AndroidExtendedBackend requires a YouTube media source')
    this.requestedRate = request.desiredRate
    this.agentReady = false
    this.lastAgentRate = undefined
    this.connectBridge()
    await this.delegate.mount(request)
    this.handleDelegateSnapshot(this.delegate.snapshot)
  }

  play(): void { this.delegate.play() }
  pause(): void { this.delegate.pause() }
  toggle(): void { this.delegate.toggle() }
  stop(): void { this.delegate.stop() }
  seekTo(seconds: number): void { this.delegate.seekTo(seconds) }
  toggleMute(): void { this.delegate.toggleMute() }
  setVolume(volume: number): void { this.delegate.setVolume(volume) }

  setRate(rate: number): void {
    if (!Number.isFinite(rate) || !isVistaPlayRate(rate)) return
    this.requestedRate = rate
    const iframeRates = this.delegate.snapshot.supportedRates
    if (iframeRates.includes(rate)) this.delegate.setRate(rate)
    else if (!this.agentReady) this.delegate.setRate(resolveSupportedRate(rate, iframeRates))
    if (this.agentReady) this.postBridge({ type: 'client:setRate', rate })
  }

  destroy(): void {
    if (this.bridge && this.bridge.onmessage) this.bridge.onmessage = null
    this.bridge = undefined
    this.agentReady = false
    this.lastAgentRate = undefined
    this.delegate.destroy()
    this.unsubscribeDelegate?.()
    this.unsubscribeDelegate = undefined
    this.emit({ ready: false, state: 'idle', position: 0, duration: 0, actualRate: 1, supportedRates: [1] })
  }
}
