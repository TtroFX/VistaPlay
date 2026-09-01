import { useEffect, useRef, useState } from 'react'
import { recordDiagnostic } from '../lib/diagnostics'
import { HTMLMediaBackend } from '../player/backends/HTMLMediaBackend'
import { invalidateYoutubeMedia, resolveYoutubeMedia } from '../player/media/youtubeMediaResolver'
import { selectInitialStream } from '../player/media/selection/TrackSelector'
import type { PlaybackBackendSnapshot } from '../player/types'

const INITIAL_SNAPSHOT: PlaybackBackendSnapshot = {
  ready: false,
  state: 'idle',
  position: 0,
  duration: 0,
  actualRate: 1,
  supportedRates: [1],
  muted: false,
  volume: 100,
  buffered: 0,
}

function hostOf(url: string): string {
  try { return new URL(url).host } catch { return url }
}

export default function PlaybackDiagnosticsPage() {
  const [videoId, setVideoId] = useState('M7lc1UVf-VE')
  const [phase, setPhase] = useState<'idle' | 'resolving' | 'mounted' | 'error'>('idle')
  const [message, setMessage] = useState('未実行')
  const [resolver, setResolver] = useState('—')
  const [stream, setStream] = useState('—')
  const [snapshot, setSnapshot] = useState<PlaybackBackendSnapshot>(INITIAL_SNAPSHOT)
  const hostRef = useRef<HTMLDivElement>(null)
  const backendRef = useRef<HTMLMediaBackend | null>(null)
  const unsubscribeRef = useRef<(() => void) | null>(null)

  useEffect(() => () => {
    unsubscribeRef.current?.()
    backendRef.current?.destroy()
  }, [])

  async function resolveAndMount() {
    const id = videoId.trim()
    const host = hostRef.current
    if (!id || !host) return

    unsubscribeRef.current?.()
    backendRef.current?.destroy()
    backendRef.current = null
    host.replaceChildren()
    invalidateYoutubeMedia(id)
    setPhase('resolving')
    setMessage('Resolver poolから再生ソースを取得しています')
    setResolver('—')
    setStream('—')
    setSnapshot(INITIAL_SNAPSHOT)

    try {
      const media = await resolveYoutubeMedia(id)
      const selected = selectInitialStream(media.streams)
      const quality = selected.qualityLabel ?? (selected.height ? `${selected.height}p` : 'unknown')
      setResolver(`${media.resolver.type} · ${hostOf(media.resolver.instance)}`)
      setStream(`${quality} · ${selected.container ?? selected.mimeType ?? 'unknown'} · ${selected.proxied ? 'proxied' : 'direct'} · ${hostOf(selected.url)}`)

      const backend = new HTMLMediaBackend()
      backendRef.current = backend
      unsubscribeRef.current = backend.subscribe((next) => setSnapshot({ ...next }))
      await backend.mount({
        host,
        media: { provider: 'web', src: selected.url, mimeType: selected.mimeType },
        startSeconds: 0,
        desiredRate: 1,
      })
      setSnapshot({ ...backend.snapshot })
      setPhase('mounted')
      setMessage('MediaをVistaPlay-owned <video>へ接続しました')
      recordDiagnostic('player', `Playback diagnostics mounted ${id} via ${media.resolver.type}`)
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error)
      setPhase('error')
      setMessage(text)
      recordDiagnostic('player', `Playback diagnostics failed: ${text}`)
    }
  }

  function setRate(rate: number) {
    backendRef.current?.setRate(rate)
    if (backendRef.current) setSnapshot({ ...backendRef.current.snapshot })
  }

  const canControl = phase === 'mounted'

  return <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px clamp(18px, 4vw, 44px) 100px' }}>
    <header style={{ marginBottom: 20 }}>
      <span className="section-kicker">PLAYBACK DIAGNOSTICS</span>
      <h1>新再生経路の実動作確認</h1>
      <p style={{ color: 'var(--muted)', maxWidth: 760 }}>YouTube IFrameは使用しません。実Resolverからmuxed streamを取得し、VistaPlayが所有するHTMLVideoElementへ直接接続して実再生速度を確認します。</p>
    </header>

    <section className="settings-card" style={{ padding: 18, marginBottom: 18 }}>
      <label style={{ display: 'grid', gap: 8 }}>
        <strong>YouTube Video ID</strong>
        <input aria-label="Diagnostics Video ID" value={videoId} onChange={(event) => setVideoId(event.target.value)} style={{ minHeight: 44, padding: '0 12px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface)' }} />
      </label>
      <button className="primary-button" type="button" onClick={() => void resolveAndMount()} disabled={phase === 'resolving'} style={{ marginTop: 12 }}>{phase === 'resolving' ? 'Resolving…' : 'Resolve & Mount'}</button>
    </section>

    <section className="settings-card" style={{ padding: 18, marginBottom: 18 }}>
      <div className="player-frame" style={{ borderRadius: 14, overflow: 'hidden' }}><div className="vistaplay-media-host" ref={hostRef} /></div>
      <div className="controls-row" style={{ marginTop: 12 }}>
        <button className="control-chip" type="button" onClick={() => backendRef.current?.play()} disabled={!snapshot.ready}>Play</button>
        <button className="control-chip" type="button" onClick={() => backendRef.current?.pause()} disabled={!snapshot.ready}>Pause</button>
        {[1, 2, 3, 4].map((rate) => <button className={`control-chip ${Math.abs(snapshot.actualRate - rate) < .001 ? 'active' : ''}`} type="button" onClick={() => setRate(rate)} disabled={!canControl} key={rate}>{rate}x</button>)}
      </div>
    </section>

    <section className="settings-card" style={{ padding: 18 }} aria-live="polite">
      <h2 style={{ marginTop: 0 }}>Result</h2>
      <dl style={{ display: 'grid', gridTemplateColumns: 'max-content minmax(0, 1fr)', gap: '8px 18px', margin: 0 }}>
        <dt>Phase</dt><dd data-testid="diag-phase">{phase}</dd>
        <dt>Message</dt><dd data-testid="diag-message">{message}</dd>
        <dt>Resolver</dt><dd data-testid="diag-resolver">{resolver}</dd>
        <dt>Stream</dt><dd data-testid="diag-stream" style={{ overflowWrap: 'anywhere' }}>{stream}</dd>
        <dt>Backend</dt><dd>html-media</dd>
        <dt>Ready</dt><dd data-testid="diag-ready">{String(snapshot.ready)}</dd>
        <dt>State</dt><dd>{snapshot.state}</dd>
        <dt>Duration</dt><dd>{snapshot.duration.toFixed(2)}s</dd>
        <dt>Position</dt><dd>{snapshot.position.toFixed(2)}s</dd>
        <dt>Actual rate</dt><dd data-testid="diag-rate"><strong>{snapshot.actualRate}x</strong></dd>
        <dt>Error</dt><dd data-testid="diag-error">{snapshot.error ?? '—'}</dd>
      </dl>
    </section>
  </div>
}
