import { afterEach, describe, expect, it, vi } from 'vitest'
import type { YouTubeNamespace, YouTubePlayer } from './backends/YouTubeIFrameBackend'

const apiSelector = 'script[src="https://www.youtube.com/iframe_api"]'
type TestWindow = Window & typeof globalThis & { YT?: YouTubeNamespace; onYouTubeIframeAPIReady?: () => void }
const target = window as TestWindow

function installYouTubeNamespace(): void {
  target.YT = {
    Player: class {} as never,
    PlayerState: { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 },
  }
}

afterEach(() => {
  delete target.YT
  delete target.onYouTubeIframeAPIReady
  document.querySelectorAll(apiSelector).forEach((script) => script.remove())
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.resetModules()
})

describe('loadYouTubeApi', () => {
  it('shares one script and promise across concurrent consumers', async () => {
    const { loadYouTubeApi } = await import('./backends/YouTubeIFrameBackend')
    const first = loadYouTubeApi()
    const second = loadYouTubeApi()

    expect(second).toBe(first)
    expect(document.querySelectorAll(apiSelector)).toHaveLength(1)

    installYouTubeNamespace()
    target.onYouTubeIframeAPIReady?.()

    await expect(first).resolves.toBe(target.YT)
    await expect(second).resolves.toBe(target.YT)
  })

  it('preserves a callback registered before VistaPlay', async () => {
    const previous = vi.fn()
    target.onYouTubeIframeAPIReady = previous
    const { loadYouTubeApi } = await import('./backends/YouTubeIFrameBackend')

    const pending = loadYouTubeApi()
    installYouTubeNamespace()
    target.onYouTubeIframeAPIReady?.()

    await pending
    expect(previous).toHaveBeenCalledOnce()
    expect(target.onYouTubeIframeAPIReady).toBe(previous)
  })

  it('removes a failed script and allows a clean retry', async () => {
    const { loadYouTubeApi } = await import('./backends/YouTubeIFrameBackend')
    const first = loadYouTubeApi()
    document.querySelector<HTMLScriptElement>(apiSelector)?.dispatchEvent(new Event('error'))

    await expect(first).rejects.toThrow('failed to load')
    expect(document.querySelector(apiSelector)).toBeNull()

    const second = loadYouTubeApi()
    expect(second).not.toBe(first)
    expect(document.querySelectorAll(apiSelector)).toHaveLength(1)

    installYouTubeNamespace()
    target.onYouTubeIframeAPIReady?.()
    await expect(second).resolves.toBe(target.YT)
  })

  it('cleans up a timed-out load before retrying', async () => {
    vi.useFakeTimers()
    const { loadYouTubeApi } = await import('./backends/YouTubeIFrameBackend')
    const pending = loadYouTubeApi()
    const rejection = expect(pending).rejects.toThrow('timed out')

    await vi.advanceTimersByTimeAsync(15_000)

    await rejection
    expect(document.querySelector(apiSelector)).toBeNull()
  })
})

describe('PWA playback-rate capability probe', () => {
  function fakePlayer(maxAcceptedRate: number): YouTubePlayer {
    let rate = 1
    return {
      cueVideoById: vi.fn(),
      loadVideoById: vi.fn(),
      playVideo: vi.fn(),
      pauseVideo: vi.fn(),
      stopVideo: vi.fn(),
      seekTo: vi.fn(),
      getCurrentTime: () => 0,
      getDuration: () => 100,
      getPlayerState: () => 5,
      getPlaybackRate: () => rate,
      setPlaybackRate: (candidate) => { rate = candidate <= maxAcceptedRate ? candidate : maxAcceptedRate },
      getAvailablePlaybackRates: () => [0.5, 1, 1.5, 2],
      isMuted: () => false,
      mute: vi.fn(),
      unMute: vi.fn(),
      getVolume: () => 100,
      setVolume: vi.fn(),
      destroy: vi.fn(),
    }
  }

  it('promotes exact >2x rates accepted by the official IFrame player', async () => {
    const { probeYouTubePlaybackRates } = await import('./backends/YouTubeIFrameBackend')
    const player = fakePlayer(4)
    const rates = await probeYouTubePlaybackRates(player, player.getAvailablePlaybackRates(), async () => undefined)

    expect(rates).toEqual([0.5, 1, 1.5, 2, 2.5, 3, 4])
    expect(player.getPlaybackRate()).toBe(1)
  })

  it('does not claim unsupported rates when YouTube rounds the suggestion down', async () => {
    const { probeYouTubePlaybackRates } = await import('./backends/YouTubeIFrameBackend')
    const player = fakePlayer(2)
    const rates = await probeYouTubePlaybackRates(player, player.getAvailablePlaybackRates(), async () => undefined)

    expect(rates).toEqual([0.5, 1, 1.5, 2])
    expect(rates).not.toContain(4)
  })
})
