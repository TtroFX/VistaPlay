import { ChevronUp, Gauge, Maximize2, Pause, Play, Repeat, RotateCcw, RotateCw, Volume2, VolumeX, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { nextPlaybackRate } from '../lib/playerMath'
import { formatDuration } from '../lib/time'
import { useApp } from '../store/AppStore'
import { playerEngine } from './PlayerEngine'

export function PersistentPlayer() {
  const app = useApp()
  const location = useLocation()
  const navigate = useNavigate()
  const hostRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const [repeat, setRepeat] = useState(false)
  const [a, setA] = useState<number>()
  const [b, setB] = useState<number>()
  const boostRate = useRef<number | undefined>(undefined)
  const lastProgress = useRef(performance.now())
  const session = useRef<{ id: string; videoId: string; startedAt: string; real: number; media: number; rates: Map<number, number> } | undefined>(undefined)
  const full = location.pathname === '/watch'
  const current = app.currentVideo

  const preferredRate = useMemo(() => {
    if (!current) return app.state.settings.playback.globalRate
    return app.state.videoPreferences.find((item) => item.videoId === current.videoId)?.playbackRate
      ?? app.state.channelPreferences.find((item) => item.channelId === current.channelId)?.playbackRate
      ?? app.state.settings.playback.globalRate
  }, [app.state.channelPreferences, app.state.settings.playback.globalRate, app.state.videoPreferences, current])

  useEffect(() => {
    if (!hostRef.current || !current) return
    const position = app.state.lastPlayer?.videoId === current.videoId ? app.state.lastPlayer.position : app.state.history[current.videoId]?.position ?? 0
    void playerEngine.mount(hostRef.current, current.videoId, position, preferredRate)
    setA(undefined); setB(undefined); setRepeat(false)
  }, [current?.videoId])

  useEffect(() => {
    if (!current) return
    if (app.player.state === 'playing' && !session.current) session.current = { id: crypto.randomUUID(), videoId: current.videoId, startedAt: new Date().toISOString(), real: 0, media: 0, rates: new Map() }
    if (app.player.state !== 'playing' && session.current) finishSession()
  }, [app.player.state, current?.videoId])

  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = performance.now(); const delta = Math.min(1.5, Math.max(0, (now - lastProgress.current) / 1000)); lastProgress.current = now
      if (app.player.state !== 'playing' || !current) return
      if (session.current) {
        session.current.real += delta; session.current.media += delta * app.player.rate
        session.current.rates.set(app.player.rate, (session.current.rates.get(app.player.rate) ?? 0) + delta)
      }
      if (Math.floor(app.player.position) % 5 === 0) app.recordProgress(current.videoId, app.player.position, app.player.duration, delta)
      if (a !== undefined && b !== undefined && app.player.position >= b) playerEngine.seekTo(a)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [a, b, app.player.duration, app.player.position, app.player.rate, app.player.state, app.recordProgress, current])

  useEffect(() => {
    if (app.player.state !== 'ended' || !current) return
    app.recordProgress(current.videoId, app.player.duration, app.player.duration)
    if (repeat) { playerEngine.seekTo(0); playerEngine.play() }
    else if (app.state.queue.length) app.playNext()
  }, [app.player.state])

  useEffect(() => {
    const save = () => { if (current && app.player.position >= 10) app.recordProgress(current.videoId, app.player.position, app.player.duration) }
    document.addEventListener('visibilitychange', save); window.addEventListener('pagehide', save)
    return () => { document.removeEventListener('visibilitychange', save); window.removeEventListener('pagehide', save); save() }
  }, [app.player.duration, app.player.position, app.recordProgress, current])

  function finishSession() {
    const value = session.current; if (!value || value.real < 0.25 || !current) { session.current = undefined; return }
    app.recordSession({ sessionId: value.id, videoId: value.videoId, channelId: current.channelId, startedAt: value.startedAt, endedAt: new Date().toISOString(), watchedMediaSeconds: value.media, realElapsedSeconds: value.real, playbackRates: [...value.rates].map(([rate, realSeconds]) => ({ rate, realSeconds })), seekEvents: [], completionRate: app.player.duration ? Math.min(1, app.player.position / app.player.duration) : 0 })
    session.current = undefined
  }

  function seek(delta: number) { playerEngine.seekBy(delta); app.notify(`${delta > 0 ? '+' : ''}${delta}秒`) }
  function setPointB() { if (a === undefined || app.player.position <= a || app.player.position - a < 2) { app.notify('BはAより2秒以上後に設定してください', 'error'); return } setB(app.player.position) }
  function boostStart() { boostRate.current = app.player.rate; playerEngine.setRate(nextPlaybackRate(app.player.rate, app.player.availableRates, app.state.settings.playback.boostMode)) }
  function boostEnd() { if (boostRate.current !== undefined) playerEngine.setRate(boostRate.current); boostRate.current = undefined }

  if (!current) return null
  return <section className={`persistent-player ${full ? 'player-full' : 'player-mini'}`} aria-label="動画プレイヤー">
    <div className="player-frame" ref={frameRef}>
      <div className="youtube-host" ref={hostRef} />
      {app.player.state === 'error' && <div className="player-error"><strong>再生できません</strong><span>{app.player.error}</span><a href={`https://www.youtube.com/watch?v=${current.videoId}`} target="_blank" rel="noreferrer">YouTubeで開く</a></div>}
    </div>
    <div className="player-control-shell">
      {!full && <button className="mini-title" onClick={() => navigate(`/watch?v=${current.videoId}`)}><strong>{current.title}</strong><span>{current.channelTitle}</span></button>}
      <div className="timeline-row">
        <span>{formatDuration(app.player.position)}</span>
        <input type="range" min="0" max={app.player.duration || 1} step="0.1" value={app.player.position} onChange={(event) => playerEngine.seekTo(Number(event.target.value))} aria-label="再生位置" />
        <span>{formatDuration(app.player.duration)}</span>
      </div>
      <div className="controls-row">
        <button className="icon-button" onClick={() => seek(-app.state.settings.playback.seekSeconds)} aria-label={`${app.state.settings.playback.seekSeconds}秒戻る`}><RotateCcw /></button>
        <button className="play-button" onClick={() => playerEngine.toggle()} aria-label={app.player.state === 'playing' ? '一時停止' : '再生'}>{app.player.state === 'playing' ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}</button>
        <button className="icon-button" onClick={() => seek(app.state.settings.playback.seekSeconds)} aria-label={`${app.state.settings.playback.seekSeconds}秒進む`}><RotateCw /></button>
        {full && <>
          <button className={`control-chip ${repeat ? 'active' : ''}`} onClick={() => setRepeat((value) => !value)}><Repeat />Repeat</button>
          {app.feature('abRepeat') && <div className="ab-controls"><button className={a !== undefined ? 'active' : ''} onClick={() => { setA(app.player.position); if (b !== undefined && b <= app.player.position + 2) setB(undefined) }}>A</button><button className={b !== undefined ? 'active' : ''} onClick={setPointB}>B</button>{a !== undefined && <button onClick={() => { setA(undefined); setB(undefined) }}>Clear</button>}</div>}
          <select className="rate-select" value={app.player.rate} onChange={(event) => playerEngine.setRate(Number(event.target.value))} aria-label="再生速度">{app.player.availableRates.map((rate) => <option key={rate} value={rate}>{rate}x</option>)}</select>
          {app.feature('temporaryBoost') && <button className="boost-button" onPointerDown={boostStart} onPointerUp={boostEnd} onPointerCancel={boostEnd}><Gauge />BOOST</button>}
        </>}
        <span className="control-spacer" />
        <button className="icon-button" onClick={() => playerEngine.toggleMute()} aria-label="ミュート切替">{app.player.muted ? <VolumeX /> : <Volume2 />}</button>
        {full ? <button className="icon-button" onClick={() => void frameRef.current?.requestFullscreen()} aria-label="全画面"><Maximize2 /></button> : <button className="icon-button" onClick={() => navigate(`/watch?v=${current.videoId}`)} aria-label="展開"><ChevronUp /></button>}
        <button className="icon-button danger-hover" onClick={() => { finishSession(); app.closePlayer() }} aria-label="プレイヤーを閉じる"><X /></button>
      </div>
    </div>
  </section>
}
