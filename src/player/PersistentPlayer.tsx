import { ChevronUp, Gauge, Maximize2, Pause, Play, Repeat, RotateCcw, RotateCw, Volume2, VolumeX, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { WatchSession } from '../domain/types'
import { nextPlaybackRate, resolvePlaybackEndAction } from '../lib/playerMath'
import { formatDuration } from '../lib/time'
import { useApp } from '../store/AppStore'
import { playerEngine } from './PlayerEngine'

interface ActiveSession {
  id: string
  videoId: string
  channelId?: string
  startedAt: string
  real: number
  media: number
  rates: Map<number, number>
  seekEvents: WatchSession['seekEvents']
  pendingWatchSeconds: number
  lastPosition: number
  duration: number
}

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
  const session = useRef<ActiveSession | undefined>(undefined)
  const full = location.pathname === '/watch'
  const current = app.currentVideo
  const latest = useRef({ app, current, a, b })
  latest.current = { app, current, a, b }

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
    const active = session.current
    if (active && active.videoId !== current?.videoId) finishSession()
    if (app.player.state === 'playing' && current && !session.current) {
      session.current = {
        id: crypto.randomUUID(), videoId: current.videoId, channelId: current.channelId,
        startedAt: new Date().toISOString(), real: 0, media: 0, rates: new Map(), seekEvents: [],
        pendingWatchSeconds: 0, lastPosition: app.player.position, duration: app.player.duration
      }
    } else if (app.player.state !== 'playing' && session.current) {
      updateSessionSnapshot()
      flushProgress()
      if (app.player.state === 'ended' || app.player.state === 'error' || app.player.state === 'idle') finishSession()
    }
    lastProgress.current = performance.now()
  }, [app.player.state, current?.videoId])

  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = performance.now()
      const delta = Math.min(1.5, Math.max(0, (now - lastProgress.current) / 1000))
      lastProgress.current = now
      const { app: currentApp, current: video, a: pointA, b: pointB } = latest.current
      const active = session.current
      if (currentApp.player.state !== 'playing' || !video || !active || active.videoId !== video.videoId) return

      const expectedPosition = active.lastPosition + delta * currentApp.player.rate
      if (Math.abs(currentApp.player.position - expectedPosition) > 3 && active.seekEvents.length < 200) {
        active.seekEvents.push({ from: active.lastPosition, to: currentApp.player.position, at: new Date().toISOString() })
      }
      active.real += delta
      active.media += delta * currentApp.player.rate
      active.pendingWatchSeconds += delta
      active.lastPosition = currentApp.player.position
      active.duration = currentApp.player.duration
      active.rates.set(currentApp.player.rate, (active.rates.get(currentApp.player.rate) ?? 0) + delta)
      if (active.pendingWatchSeconds >= 5) flushProgress()
      if (pointA !== undefined && pointB !== undefined && currentApp.player.position >= pointB) performSeek(pointA, false)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (app.player.state !== 'ended' || !current) return
    app.recordProgress(current.videoId, app.player.duration, app.player.duration)
    const channelAutoplay = app.state.channelPreferences.find((item) => item.channelId === current.channelId)?.queueAutoplay
    const action = resolvePlaybackEndAction(repeat, app.state.queue.length, channelAutoplay ?? app.state.settings.playback.continuousPlay)
    if (action === 'repeat') { performSeek(0, false); playerEngine.play() }
    else if (action === 'next') app.playNext()
  }, [app.player.state, current?.videoId])

  useEffect(() => {
    const save = () => {
      updateSessionSnapshot()
      flushProgress()
      const { app: currentApp, current: video } = latest.current
      if (!session.current && video && currentApp.player.position >= 10) currentApp.recordProgress(video.videoId, currentApp.player.position, currentApp.player.duration)
    }
    const finish = () => { save(); finishSession() }
    document.addEventListener('visibilitychange', save)
    window.addEventListener('pagehide', finish)
    return () => { document.removeEventListener('visibilitychange', save); window.removeEventListener('pagehide', finish); save() }
  }, [])

  useEffect(() => {
    updateSessionSnapshot()
    flushProgress()
  }, [location.pathname])

  function updateSessionSnapshot() {
    const active = session.current
    if (!active) return
    active.lastPosition = latest.current.app.player.position
    active.duration = latest.current.app.player.duration
  }

  function flushProgress() {
    const active = session.current
    if (!active || active.pendingWatchSeconds <= 0) return
    latest.current.app.recordProgress(active.videoId, active.lastPosition, active.duration, active.pendingWatchSeconds)
    active.pendingWatchSeconds = 0
  }

  function finishSession() {
    updateSessionSnapshot()
    flushProgress()
    const value = session.current
    if (!value || value.real < 0.25) { session.current = undefined; return }
    latest.current.app.recordSession({ sessionId: value.id, videoId: value.videoId, channelId: value.channelId, startedAt: value.startedAt, endedAt: new Date().toISOString(), watchedMediaSeconds: value.media, realElapsedSeconds: value.real, playbackRates: [...value.rates].map(([rate, realSeconds]) => ({ rate, realSeconds })), seekEvents: value.seekEvents, completionRate: value.duration ? Math.min(1, value.lastPosition / value.duration) : 0 })
    session.current = undefined
  }

  function performSeek(target: number, record = true) {
    const snapshot = latest.current.app.player
    const actualTarget = Math.max(0, Math.min(target, snapshot.duration || target))
    const active = session.current
    if (active) {
      if (record && Math.abs(actualTarget - snapshot.position) >= 0.5 && active.seekEvents.length < 200) active.seekEvents.push({ from: snapshot.position, to: actualTarget, at: new Date().toISOString() })
      active.lastPosition = actualTarget
    }
    playerEngine.seekTo(actualTarget)
  }

  function seek(delta: number) { performSeek(app.player.position + delta); app.notify(`${delta > 0 ? '+' : ''}${delta}秒`) }
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
        <input type="range" min="0" max={app.player.duration || 1} step="0.1" value={app.player.position} onChange={(event) => performSeek(Number(event.target.value))} aria-label="再生位置" />
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
        {full && <label className="volume-control"><span className="sr-only">音量</span><input type="range" min="0" max="100" step="1" value={app.player.volume} onChange={(event) => playerEngine.setVolume(Number(event.target.value))} aria-label="音量" /><span>{Math.round(app.player.volume)}%</span></label>}
        {full ? <button className="icon-button" onClick={() => void frameRef.current?.requestFullscreen()} aria-label="全画面"><Maximize2 /></button> : <button className="icon-button" onClick={() => navigate(`/watch?v=${current.videoId}`)} aria-label="展開"><ChevronUp /></button>}
        <button className="icon-button danger-hover" onClick={() => { finishSession(); app.closePlayer() }} aria-label="プレイヤーを閉じる"><X /></button>
      </div>
      {full && <div className="speed-preset-strip" role="group" aria-label="再生速度プリセット">{app.state.settings.playback.speedPresets.map((rate) => <button type="button" className={app.player.rate === rate ? 'active' : ''} aria-pressed={app.player.rate === rate} disabled={!app.player.availableRates.includes(rate)} onClick={() => playerEngine.setRate(rate)} key={rate}>{rate}x</button>)}</div>}
    </div>
  </section>
}
