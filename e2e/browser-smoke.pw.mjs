import { expect, test } from '@playwright/test'

const VIDEO_A = 'dQw4w9WgXcQ'
const VIDEO_B = 'M7lc1UVf-VE'

async function installYouTubeStub(page) {
  await page.route('https://raw.githubusercontent.com/iv-org/documentation/master/docs/instances.md', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/plain',
      body: '* [Smoke Invidious](https://inv.nadeko.net)\n',
    })
  })

  await page.route(/https:\/\/(?:inv\.nadeko\.net|invidious\.nerdvpn\.de|yt\.chocolatemoo53\.com|invidious\.tiekoetter\.com)\/api\/v1\/videos\/.*/, async (route) => {
    const requestUrl = new URL(route.request().url())
    const videoId = decodeURIComponent(requestUrl.pathname.split('/').pop() ?? VIDEO_A)
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        lengthSeconds: 600,
        formatStreams: [{
          url: `https://inv.nadeko.net/videoplayback?local=true&id=${encodeURIComponent(videoId)}`,
          type: 'video/mp4; codecs="avc1.64001F, mp4a.40.2"',
          quality: 'hd720',
          qualityLabel: '720p',
          resolution: '1280x720',
          container: 'mp4',
          bitrate: 1_500_000,
          encoding: 'h264',
        }],
      }),
    })
  })

  await page.addInitScript(() => {
    const calls = []
    Object.defineProperty(window, '__vistaplayYtCalls', { value: calls, configurable: true })
    const nativeCreateElement = Document.prototype.createElement
    Document.prototype.createElement = function createElement(name, options) {
      const element = nativeCreateElement.call(this, name, options)
      if (String(name).toLowerCase() !== 'video') return element

      let paused = true
      let currentTime = 0
      Object.defineProperties(element, {
        readyState: { configurable: true, get: () => HTMLMediaElement.HAVE_ENOUGH_DATA },
        duration: { configurable: true, get: () => 600 },
        paused: { configurable: true, get: () => paused },
        currentTime: {
          configurable: true,
          get: () => currentTime,
          set: (value) => {
            currentTime = Number.isFinite(Number(value)) ? Number(value) : 0
            element.dispatchEvent(new Event('timeupdate'))
          },
        },
        buffered: {
          configurable: true,
          get: () => ({ length: 1, start: () => 0, end: () => 600 }),
        },
      })
      element.load = () => {
        queueMicrotask(() => {
          element.dispatchEvent(new Event('loadstart'))
          element.dispatchEvent(new Event('loadedmetadata'))
          element.dispatchEvent(new Event('durationchange'))
          element.dispatchEvent(new Event('canplay'))
          element.dispatchEvent(new Event('progress'))
        })
      }
      element.play = () => {
        paused = false
        calls.push(['play', element.src])
        element.dispatchEvent(new Event('play'))
        element.dispatchEvent(new Event('playing'))
        return Promise.resolve()
      }
      element.pause = () => {
        paused = true
        calls.push(['pause', element.src])
        element.dispatchEvent(new Event('pause'))
      }
      return element
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

test('tablet shell, resolver-backed 4x player, persistent mini player, queue and IndexedDB persistence', async ({ page }) => {
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
  await expect(page.locator('.vistaplay-media')).toBeVisible()
  await expect(page.getByRole('button', { name: '再生' })).toBeEnabled()
  await page.getByLabel('再生速度').selectOption('4')
  await expect.poll(() => page.locator('.vistaplay-media').evaluate((element) => element.playbackRate)).toBe(4)
  await expect(page.locator('.player-source-label')).toContainText('実再生 4x')
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

test('Search Back restores query and results but resets scroll to top', async ({ page }) => {
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
  expect(storedSearchState?.scroll).toBe(0)
  await page.goBack()
  await expect(page).toHaveURL(/\/search$/)
  await expect(input).toHaveValue('smoke-seed')
  await expect(page.locator('.video-card')).toHaveCount(30)
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)

  expect(blockingErrors, blockingErrors.join('\n')).toEqual([])
})

test('feature guard and reduced motion', async ({ page }) => {
  const blockingErrors = watchBlockingErrors(page)

  await page.goto('/settings/features')
  const watchInboxSwitch = page.getByRole('switch', { name: 'Watch Inbox' })
  await watchInboxSwitch.locator('..').click()
  await expect(watchInboxSwitch).not.toBeChecked()
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
