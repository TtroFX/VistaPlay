import { chromium } from 'playwright-core'

const endpoint = process.env.WEBVIEW_CDP_ENDPOINT ?? 'http://127.0.0.1:9222'
const appOrigin = 'https://ttrofx.github.io/VistaPlay'
const candidateVideoIds = ['M7lc1UVf-VE', 'jNQXAC9IVRw']

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function main() {
  const browser = await chromium.connectOverCDP(endpoint)
  try {
    const context = browser.contexts()[0]
    assert(context, 'Android WebView exposed no CDP browser context')

    let page = context.pages()[0]
    if (!page) page = await context.newPage()

    await page.goto(`${appOrigin}/diagnostics/playback`, {
      waitUntil: 'domcontentloaded',
      timeout: 45_000,
    })
    await page.getByRole('heading', { name: '新再生経路の実動作確認' }).waitFor({ timeout: 30_000 })

    const nativeBridge = await page.evaluate(() => ({
      exists: Boolean(window.VistaPlayNative),
      postMessage: typeof window.VistaPlayNative?.postMessage === 'function',
      onmessage: window.VistaPlayNative ? 'onmessage' in window.VistaPlayNative : false,
    }))
    console.log(`native bridge=${JSON.stringify(nativeBridge)}`)
    assert(nativeBridge.exists && nativeBridge.postMessage && nativeBridge.onmessage, 'VistaPlayNative bridge is not fully available in Android WebView')

    const attempts = []
    let mounted = false
    for (const videoId of candidateVideoIds) {
      await page.getByLabel('Diagnostics Video ID').fill(videoId)
      await page.getByRole('button', { name: 'Resolve & Mount' }).click()
      await page.waitForFunction(() => {
        const phase = document.querySelector('[data-testid="diag-phase"]')?.textContent
        return phase === 'mounted' || phase === 'error'
      }, undefined, { timeout: 55_000 })

      const state = await page.evaluate(() => ({
        phase: document.querySelector('[data-testid="diag-phase"]')?.textContent ?? '',
        resolver: document.querySelector('[data-testid="diag-resolver"]')?.textContent ?? '',
        stream: document.querySelector('[data-testid="diag-stream"]')?.textContent ?? '',
        ready: document.querySelector('[data-testid="diag-ready"]')?.textContent ?? '',
        error: document.querySelector('[data-testid="diag-error"]')?.textContent ?? '',
      }))
      console.log(`attempt ${videoId}: ${JSON.stringify(state)}`)
      attempts.push({ videoId, ...state })
      if (state.phase === 'mounted' && state.ready === 'true') {
        mounted = true
        break
      }
    }

    assert(mounted, `Native resolver produced no playable media: ${JSON.stringify(attempts)}`)

    const resolver = await page.getByTestId('diag-resolver').textContent()
    const stream = await page.getByTestId('diag-stream').textContent()
    assert(resolver?.includes('piped'), `Unexpected resolver: ${resolver}`)
    assert(stream?.includes('proxied'), `Expected proxied muxed stream, got: ${stream}`)

    await page.getByRole('button', { name: '4x', exact: true }).click()
    await page.waitForFunction(() => document.querySelector('[data-testid="diag-rate"]')?.textContent?.trim() === '4x', undefined, { timeout: 10_000 })
    const rate = await page.locator('.vistaplay-media').evaluate((element) => element.playbackRate)
    assert(rate === 4, `HTMLMediaElement playbackRate is ${rate}, expected 4`)

    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await page.waitForFunction(() => {
      const media = document.querySelector('.vistaplay-media')
      return media instanceof HTMLMediaElement && media.currentTime > 0.05
    }, undefined, { timeout: 20_000 })

    const playback = await page.locator('.vistaplay-media').evaluate((element) => ({
      currentTime: element.currentTime,
      playbackRate: element.playbackRate,
      paused: element.paused,
      readyState: element.readyState,
    }))
    console.log(`runtime playback=${JSON.stringify(playback)}`)
    assert(playback.currentTime > 0.05 && playback.playbackRate === 4, 'Android WebView media did not advance at 4x')
  } finally {
    await browser.close().catch(() => {})
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exit(1)
})
