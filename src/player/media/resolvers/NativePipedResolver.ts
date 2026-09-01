import { MediaResolverError, type MediaResolver } from '../MediaResolver'
import type { ResolvedMedia } from '../types'
import { normalizePipedResponse } from './PipedResolver'

interface NativeResolveResponse {
  type?: unknown
  requestId?: unknown
  ok?: unknown
  instance?: unknown
  payload?: unknown
  error?: unknown
}

interface PendingRequest {
  resolve: (response: NativeResolveResponse) => void
  reject: (error: Error) => void
  timeoutId: ReturnType<typeof setTimeout>
  signal?: AbortSignal
  abort?: () => void
}

export class NativePipedResolver implements MediaResolver {
  readonly id = 'native-piped'
  private readonly pending = new Map<string, PendingRequest>()

  constructor(private readonly bridge: VistaPlayNativeBridge | undefined = getNativeBridge()) {
    if (!bridge) return
    const previousHandler = bridge.onmessage
    bridge.onmessage = (event) => {
      if (!this.handleMessage(event)) previousHandler?.(event)
    }
  }

  async resolve(videoId: string, signal?: AbortSignal): Promise<ResolvedMedia> {
    if (!this.bridge) throw new MediaResolverError('RESOLVE_FAILED', 'VistaPlay native resolver bridge is unavailable')
    if (signal?.aborted) throw new DOMException('Resolution aborted', 'AbortError')

    const response = await this.request(videoId, signal)
    if (response.ok !== true) {
      throw new MediaResolverError('RESOLVE_FAILED', typeof response.error === 'string' ? response.error : 'Native resolver failed')
    }
    if (typeof response.instance !== 'string') throw new MediaResolverError('INVALID_RESPONSE', 'Native resolver omitted its Piped instance')
    return normalizePipedResponse(videoId, response.instance, response.payload)
  }

  private request(videoId: string, signal?: AbortSignal): Promise<NativeResolveResponse> {
    const bridge = this.bridge
    if (!bridge) return Promise.reject(new MediaResolverError('RESOLVE_FAILED', 'VistaPlay native resolver bridge is unavailable'))
    const requestId = createRequestId()

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        const pending = this.pending.get(requestId)
        if (pending?.signal && pending.abort) pending.signal.removeEventListener('abort', pending.abort)
        this.pending.delete(requestId)
        reject(new MediaResolverError('RESOLVER_TIMEOUT', 'Native resolver timed out'))
      }, 45_000)
      const abort = signal ? () => {
        clearTimeout(timeoutId)
        this.pending.delete(requestId)
        reject(new DOMException('Resolution aborted', 'AbortError'))
      } : undefined
      if (signal && abort) signal.addEventListener('abort', abort, { once: true })
      this.pending.set(requestId, { resolve, reject, timeoutId, signal, abort })

      try {
        bridge.postMessage(JSON.stringify({ type: 'resolveYouTubeMedia', requestId, videoId }))
      } catch (error) {
        clearTimeout(timeoutId)
        if (signal && abort) signal.removeEventListener('abort', abort)
        this.pending.delete(requestId)
        reject(new MediaResolverError('RESOLVE_FAILED', error instanceof Error ? error.message : 'Native resolver request failed'))
      }
    })
  }

  private handleMessage(event: VistaPlayNativeMessageEvent): boolean {
    let response: NativeResolveResponse
    try {
      response = JSON.parse(event.data) as NativeResolveResponse
    } catch {
      return false
    }
    if (response.type !== 'resolveYouTubeMediaResult' || typeof response.requestId !== 'string') return false
    const pending = this.pending.get(response.requestId)
    if (!pending) return true
    clearTimeout(pending.timeoutId)
    if (pending.signal && pending.abort) pending.signal.removeEventListener('abort', pending.abort)
    this.pending.delete(response.requestId)
    pending.resolve(response)
    return true
  }
}

function getNativeBridge(): VistaPlayNativeBridge | undefined {
  return typeof window === 'undefined' ? undefined : window.VistaPlayNative
}

function createRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `native-${Date.now()}-${Math.random().toString(36).slice(2)}`
}
