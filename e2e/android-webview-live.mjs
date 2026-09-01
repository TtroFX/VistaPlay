const endpoint = process.env.WEBVIEW_CDP_ENDPOINT ?? 'http://127.0.0.1:9222'
const appOrigin = 'https://ttrofx.github.io/VistaPlay'
const candidateVideoIds = ['M7lc1UVf-VE', 'jNQXAC9IVRw']

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

class PageCdp {
  constructor(webSocketUrl) {
    this.webSocketUrl = webSocketUrl
    this.socket = null
    this.nextId = 1
    this.pending = new Map()
  }

  async connect() {
    const socket = new WebSocket(this.webSocketUrl)
    this.socket = socket
    socket.onmessage = (event) => {
      const raw = typeof event.data === 'string' ? event.data : Buffer.from(event.data).toString('utf8')
      const message = JSON.parse(raw)
      if (!message.id) return
      const pending = this.pending.get(message.id)
      if (!pending) return
      this.pending.delete(message.id)
      clearTimeout(pending.timer)
      if (message.error) pending.reject(new Error(`${pending.method}: ${message.error.message}`))
      else pending.resolve(message.result ?? {})
    }
    socket.onclose = () => {
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer)
        pending.reject(new Error(`CDP socket closed while waiting for ${pending.method}`))
      }
      this.pending.clear()
    }
    await new Promise((resolve, reject) => {
      socket.onopen = resolve
      socket.onerror = () => reject(new Error(`Failed to connect to WebView page CDP: ${this.webSocketUrl}`))
    })
    await this.send('Page.enable')
    await this.send('Runtime.enable')
  }

  send(method, params = {}, timeoutMs = 30_000) {
    assert(this.socket?.readyState === WebSocket.OPEN, 'CDP socket is not open')
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Timed out waiting for CDP command ${method}`))
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timer, method })
      this.socket.send(JSON.stringify({ id, method, params }))
    })
  }

  async evaluate(expression, { awaitPromise = true } = {}) {
    const response = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise,
      returnByValue: true,
      userGesture: true,
    })
    if (response.exceptionDetails) {
      const detail = response.exceptionDetails.exception?.description ?? response.exceptionDetails.text ?? 'Runtime.evaluate failed'
      throw new Error(detail)
    }
    return response.result?.value
  }

  async waitFor(expression, timeoutMs = 30_000, intervalMs = 300) {
    const deadline = Date.now() + timeoutMs
    let lastError = null
    while (Date.now() < deadline) {
      try {
        if (await this.evaluate(expression)) return
        lastError = null
      } catch (error) {
        lastError = error
      }
      await sleep(intervalMs)
    }
    throw new Error(`Timed out waiting for: ${expression}${lastError ? ` (${lastError.message})` : ''}`)
  }

  close() {
    this.socket?.close()
  }
}

async function getPageTarget() {
  const response = await fetch(`${endpoint}/json`)
  assert(response.ok, `WebView /json returned HTTP ${response.status}`)
  const targets = await response.json()
  const page = targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl)
  assert(page, `No debuggable WebView page target: ${JSON.stringify(targets)}`)
  return page
}

async function clickByText(cdp, text) {
  const clicked = await cdp.evaluate(`(() => {
    const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.trim() === ${JSON.stringify(text)})
    if (!button) return false
    button.click()
    return true
  })()`)
  assert(clicked, `Button not found: ${text}`)
}

async function fillVideoId(cdp, videoId) {
  const filled = await cdp.evaluate(`(() => {
    const input = document.querySelector('input[aria-label="Diagnostics Video ID"]')
    if (!(input instanceof HTMLInputElement)) return false
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    if (!setter) return false
    setter.call(input, ${JSON.stringify(videoId)})
    input.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  })()`)
  assert(filled, 'Diagnostics Video ID input was not found')
}

async function diagnosticsState(cdp) {
  return cdp.evaluate(`(() => ({
    phase: document.querySelector('[data-testid="diag-phase"]')?.textContent ?? '',
    resolver: document.querySelector('[data-testid="diag-resolver"]')?.textContent ?? '',
    stream: document.querySelector('[data-testid="diag-stream"]')?.textContent ?? '',
    ready: document.querySelector('[data-testid="diag-ready"]')?.textContent ?? '',
    rate: document.querySelector('[data-testid="diag-rate"]')?.textContent?.trim() ?? '',
    error: document.querySelector('[data-testid="diag-error"]')?.textContent ?? '',
  }))()`)
}

async function main() {
  const target = await getPageTarget()
  console.log(`page target=${target.webSocketDebuggerUrl}`)
  const cdp = new PageCdp(target.webSocketDebuggerUrl)
  await cdp.connect()

  try {
    await cdp.send('Page.navigate', { url: `${appOrigin}/diagnostics/playback` })
    await cdp.waitFor(`document.readyState !== 'loading' && [...document.querySelectorAll('h1')].some((item) => item.textContent?.trim() === '新再生経路の実動作確認')`, 45_000)

    const nativeBridge = await cdp.evaluate(`(() => ({
      exists: Boolean(window.VistaPlayNative),
      postMessage: typeof window.VistaPlayNative?.postMessage === 'function',
      onmessage: window.VistaPlayNative ? 'onmessage' in window.VistaPlayNative : false,
    }))()`)
    console.log(`native bridge=${JSON.stringify(nativeBridge)}`)
    assert(nativeBridge.exists && nativeBridge.postMessage && nativeBridge.onmessage, 'VistaPlayNative bridge is not fully available in Android WebView')

    const attempts = []
    let mountedState = null
    for (const videoId of candidateVideoIds) {
      await fillVideoId(cdp, videoId)
      await clickByText(cdp, 'Resolve & Mount')
      await sleep(300)
      await cdp.waitFor(`['mounted', 'error'].includes(document.querySelector('[data-testid="diag-phase"]')?.textContent ?? '')`, 60_000)
      const state = await diagnosticsState(cdp)
      console.log(`attempt ${videoId}: ${JSON.stringify(state)}`)
      attempts.push({ videoId, ...state })

      if (state.phase === 'mounted') {
        try {
          await cdp.waitFor(`document.querySelector('[data-testid="diag-ready"]')?.textContent === 'true'`, 30_000)
          mountedState = await diagnosticsState(cdp)
          break
        } catch (error) {
          attempts.push({ videoId, readyWaitError: error.message, ...(await diagnosticsState(cdp)) })
        }
      }
    }

    assert(mountedState, `Native resolver produced no playable media: ${JSON.stringify(attempts)}`)
    assert(mountedState.resolver.includes('piped'), `Unexpected resolver: ${mountedState.resolver}`)
    assert(mountedState.stream.includes('proxied'), `Expected proxied muxed stream, got: ${mountedState.stream}`)

    await clickByText(cdp, '4x')
    await cdp.waitFor(`document.querySelector('[data-testid="diag-rate"]')?.textContent?.trim() === '4x'`, 10_000)
    const rate = await cdp.evaluate(`document.querySelector('.vistaplay-media')?.playbackRate`)
    console.log(`playbackRate after 4x=${rate}`)
    assert(Math.abs(rate - 4) < 0.01, `HTMLMediaElement playbackRate is ${rate}, expected 4`)

    const before = await cdp.evaluate(`document.querySelector('.vistaplay-media')?.currentTime ?? -1`)
    await clickByText(cdp, 'Play')
    await cdp.waitFor(`(() => {
      const media = document.querySelector('.vistaplay-media')
      return media instanceof HTMLMediaElement && !media.paused && media.currentTime > ${Number(before) + 0.05}
    })()`, 25_000)

    const playback = await cdp.evaluate(`(() => {
      const media = document.querySelector('.vistaplay-media')
      return media instanceof HTMLMediaElement ? {
        currentTime: media.currentTime,
        playbackRate: media.playbackRate,
        paused: media.paused,
        readyState: media.readyState,
      } : null
    })()`)
    console.log(`runtime playback=${JSON.stringify(playback)}`)
    assert(playback && playback.currentTime > before + 0.05 && Math.abs(playback.playbackRate - 4) < 0.01 && !playback.paused,
      `Android WebView media did not advance at 4x: before=${before}, after=${JSON.stringify(playback)}`)
  } finally {
    cdp.close()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exit(1)
})
