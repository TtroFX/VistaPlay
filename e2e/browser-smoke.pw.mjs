import { expect, test } from '@playwright/test'

const VIDEO_A = 'dQw4w9WgXcQ'
const VIDEO_B = 'M7lc1UVf-VE'

async function installYouTubeStub(page) {
  await page.addInitScript(() => {
    const calls = []
    Object.defineProperty(window, '__vistaplayYtCalls', { value: calls, configurable: true })
    class StubPlayer {
      constructor(_element, options) {
        this.options = options
        this.videoId = options.videoId
        this.position = Number(options.playerVars?.start ?? 0)
        this.duration = 600
        this.rate = 1
        this.volume = 100
        this.muted = false
        this.state = 5
        queueMicrotask(() => options.events?.onReady?.({ target: this }))
      }
      emit(data) { this.options.events?.onStateChange?.({ data }) }
      cueVideoById(id, start = 0) { this.videoId = id; this.position = start; this.state = 5; calls.push(['cue', id]); this.emit(5) }
      loadVideoById(id, start = 0) { this.videoId = id; this.position = start; this.state = 1; calls.push(['load', id]); this.emit(1) }
      playVideo() { this.state = 1; calls.push(['play', this.videoId]); this.emit(1) }
      pauseVideo() { this.state = 2; calls.push(['pause', this.videoId]); this.emit(2) }
      stopVideo() { this.state = -1; calls.push(['stop', this.videoId]) }
      seekTo(seconds) { this.position = seconds; calls.push(['seek', seconds]) }
      getCurrentTime() { return this.position }
      getDuration() { return this.duration }
      getPlayerState() { return this.state }
      getPlaybackRate() { return this.rate }
      setPlaybackRate(rate) { this.rate = rate; this.options.events?.onPlaybackRateChange?.({ data: rate }) }
      getAvailablePlaybackRates() { return [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] }
      isMuted() { return this.muted }
      mute() { this.muted = true }
      unMute() { this.muted = false }
      getVolume() { return this.volume }
      setVolume(value) { this.volume = value }
      destroy() { calls.push(['destroy', this.videoId]) }
    }
    window.YT = {
      Player: StubPlayer,
      PlayerState: { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 },
    }
  })
}

async function seedSearchResults(page) {
  await page.addInitScript(() => {
    if (location.pathname !== '/search' || sessionStorage.getItem('vistaplay-smoke-search-seeded')) return
    const thumbnail = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="320" height="180"/%3E'
    const results = Array.from({ length: 30 }, (_, index) => {
      const id = `SMOKE${String(index).padStart(6, '0')}`
      const video = { videoId: id, title: `Smoke video ${index}`, channelTitle: 'Smoke Channel', thumbnail, durationSeconds: 600, available: true }
      return { type: 'video', id, title: video.title, thumbnail, channelTitle: video.channelTitle, video }
    })
    sessionStorage.setItem('vistaplay-search-state', JSON.stringify({
      query: 'smoke-seed',
      filters: { type: 'video', duration: 'any', live: 'any', excludeChannels: [], excludeKeywords: [], shorts: 'include', whitelistOnly: false },
      results,
      sort: 'relevance',
      scroll: 0,
    }))
    sessionStorage.setItem('vistaplay-smoke-search-seeded', '1')
  })
}

function watchBlockingErrors(page) {
  const errors = []
  const localOrigin = 'http://127.0.0.1:4173'
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) errors.push(`console: ${message.text()}`)
  })
  page.on('response', (response) => {
    if (response.status() < 400) return
    const url = new URL(response.url())
    if (url.origin === localOrigin) errors.push(`http ${response.status()}: ${url.pathname}`)
  })
  return errors
}

async function expectNoHorizontalOverflow(page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(1)
}

test('tablet shell, direct Watch, persistent mini player, queue and IndexedDB persistence', async ({ page }) => {
  await installYouTubeStub(page)
  const blockingErrors = watchBlockingErrors(page)

  await page.goto('/')
  await expect(page.getByRole('heading', { name: '見たい動画へ、まっすぐ。' })).toBeVisible()
  await expectNoHorizontalOverflow(page)

  await page.setViewportSize({ width: 800, height: 1280 })
  await expect(page.getByRole('heading', { name: '見たい動画へ、まっすぐ。' })).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.setViewportSize({ width: 1280, height: 800 })

  await page.goto(`/watch?v=${VIDEO_A}`)
  await expect(page.locator('.persistent-player.player-full')).toBeVisible()
  await expect(page.getByRole('button', { name: '再生' })).toBeVisible()
  expect(await page.evaluate(() => window.__vistaplayYtCalls.filter(([kind]) => kind === 'play').length)).toBe(0)

  await page.getByRole('button', { name: 'お気に入り' }).click()
  await page.getByRole('button', { name: 'Queue', exact: true }).click()
  await page.getByRole('button', { name: 'Queue', exact: true }).click()
  await page.getByLabel('Video note').fill('browser smoke note')
  await page.getByLabel('Video note').blur()
  await page.getByRole('button', { name: 'Archive' }).click()
  await page.waitForTimeout(350)

  await page.getByRole('link', { name: 'Home' }).click()
  await expect(page.locator('.persistent-player.player-mini')).toBeVisible()

  await page.goto(`/watch?v=${VIDEO_B}`)
  await page.getByRole('button', { name: 'Queue', exact: true }).click()
  await page.getByRole('link', { name: 'Queue' }).click()
  await expect(page.locator('.queue-row')).toHaveCount(2)

  const firstRowBefore = page.locator('.queue-row').first()
  await expect(firstRowBefore.locator('.queue-title strong')).toContainText(VIDEO_A)
  await firstRowBefore.getByRole('button', { name: '下へ' }).click()
  await expect(page.locator('.queue-row').first().locator('.queue-title strong')).toContainText(VIDEO_B)

  await page.locator('.queue-row').first().getByRole('button', { name: '削除' }).click()
  await expect(page.locator('.queue-row')).toHaveCount(1)
  await page.getByRole('button', { name: '元に戻す' }).click()
  await expect(page.locator('.queue-row')).toHaveCount(2)
  await page.waitForTimeout(350)
  await page.reload()
  await expect(page.locator('.queue-row')).toHaveCount(2)

  await page.goto(`/watch?v=${VIDEO_A}`)
  await expect(page.getByRole('button', { name: 'お気に入り' })).toHaveClass(/active/)
  await expect(page.getByLabel('Video note')).toHaveValue('browser smoke note')
  await page.getByRole('link', { name: 'History' }).click()
  await expect(page.locator('.history-entry')).toHaveCount(1)
  await expect(page.locator('.watch-state')).toContainText('ARCHIVED')

  expect(blockingErrors, blockingErrors.join('\n')).toEqual([])
})

test('Search Back restores query, results and scroll position', async ({ page }) => {
  await installYouTubeStub(page)
  await seedSearchResults(page)
  const blockingErrors = watchBlockingErrors(page)

  await page.goto('/search')
  const input = page.getByPlaceholder('検索語、YouTube URL、Video ID')
  await expect(input).toHaveValue('smoke-seed')
  await expect(page.locator('.video-card')).toHaveCount(30)
  await page.evaluate(() => window.scrollTo(0, 700))
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(500)
  await page.evaluate(() => {
    const card = [...document.querySelectorAll('.video-card')].find((element) => {
      const bounds = element.getBoundingClientRect()
      return bounds.top >= 80 && bounds.bottom <= window.innerHeight - 20
    })
    const button = card?.querySelector('.thumbnail-button')
    if (!(button instanceof HTMLButtonElement)) throw new Error('No visible Search result card available')
    button.click()
  })
  await expect(page).toHaveURL(/\/watch\?v=/)
  const storedSearchState = await page.evaluate(() => JSON.parse(sessionStorage.getItem('vistaplay-search-state') ?? 'null'))
  expect(storedSearchState?.scroll).toBeGreaterThan(500)
  await page.goBack()
  await expect(page).toHaveURL(/\/search$/)
  await expect(input).toHaveValue('smoke-seed')
  await expect(page.locator('.video-card')).toHaveCount(30)
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(500)

  expect(blockingErrors, blockingErrors.join('\n')).toEqual([])
})

test('feature guard and reduced motion', async ({ page }) => {
  const blockingErrors = watchBlockingErrors(page)

  await page.goto('/settings/features')
  const watchInboxSwitch = page.getByRole('switch', { name: 'Watch Inbox' })
  await watchInboxSwitch.uncheck()
  await expect(page.getByRole('link', { name: 'Watch Inbox' })).toHaveCount(0)
  await page.waitForTimeout(350)
  await page.goto('/inbox')
  await expect(page.getByText('Page not found', { exact: true })).toBeVisible()

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const reduced = await page.locator('.primary-button').first().evaluate((element) => {
    const style = getComputedStyle(element)
    return { duration: style.transitionDuration, property: style.transitionProperty }
  })
  expect(reduced.duration).toMatch(/0\.08s|80ms/)
  expect(reduced.property).not.toContain('transform')

  expect(blockingErrors, blockingErrors.join('\n')).toEqual([])
})

test('AI import rejects invalid, oversize and wrong-version payloads in the browser', async ({ page }) => {
  await installYouTubeStub(page)
  await page.goto('/ai')
  const input = page.locator('.ai-import textarea')
  const validate = page.getByRole('button', { name: /Validate/ })

  await input.fill('{')
  await validate.click()
  await expect(page.locator('.import-status.error')).toContainText('拒否:')

  await input.fill('{"version":999,"type":"youtube_recommendations","query":"x","items":[]}')
  await validate.click()
  await expect(page.locator('.import-status.error')).toContainText('拒否:')

  await input.fill(`{"version":1,"type":"youtube_recommendations","query":"${'x'.repeat(70_000)}","items":[]}`)
  await validate.click()
  await expect(page.locator('.import-status.error')).toContainText('拒否:')
})

test('PWA shell and IndexedDB data survive offline reload', async ({ page, context }) => {
  await installYouTubeStub(page)
  await page.goto(`/watch?v=${VIDEO_A}`)
  await page.getByRole('button', { name: 'お気に入り' }).click()
  await page.waitForTimeout(350)
  await page.goto('/')

  const swSupported = await page.evaluate(() => 'serviceWorker' in navigator)
  expect(swSupported).toBe(true)
  await page.evaluate(async () => { await navigator.serviceWorker.ready })
  await page.reload()
  await expect(page.getByRole('heading', { name: '見たい動画へ、まっすぐ。' })).toBeVisible()

  await context.setOffline(true)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: '見たい動画へ、まっすぐ。' })).toBeVisible()
  await page.goto(`/watch?v=${VIDEO_A}`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('button', { name: 'お気に入り' })).toHaveClass(/active/)
  await context.setOffline(false)
})
