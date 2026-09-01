import { Maximize2, Pause, Play, RotateCcw, RotateCw, Volume2, VolumeX, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { toggleFullscreen } from '../lib/fullscreen'
import { formatDuration } from '../lib/time'
import { useApp } from '../store/AppStore'
import { resolveYoutubeMedia } from './media/youtubeMediaResolver'
import { selectInitialStream } from './media/selection/TrackSelector'
import { playbackOrchestrator } from './PlaybackOrchestrator'
import { resolveSupportedRate, VISTAPLAY_PLAYBACK_RATES } from './playbackRates'
import { PlaybackRateControl } from './ui/PlaybackRateControl'
import './player.css'

export function PersistentPlayer() {
  const app = useApp()
  const location = useLocation()
  const navigate = useNavigate()
  const hostRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const latestPlayback = useRef({ player: app.player, recordProgress: app.recordProgress })
  const [resolverState, setResolverState] = useState<'idle' | 'resolving' | 'ready' | 'error'>('idle')
  const [resolverError, setResolverError] = useState('')
  const [sourceLabel, setSourceLabel] = useState('')
  const current = app.currentVideo
  const full = location.pathname === '/watch'

  useEffect(() => {
    latestPlayback.current = { player: app.player, recordProgress: app.recordProgress }
  }, [app.player, app.recordProgress])

  const preferredRate = useMemo(() => {
    const raw = current
      ? app.state.videoPreferences.find((item) => item.videoId === current.videoId)?.playbackRate
        ?? app.state.channelPreferences.find((item) => item.channelId === current.channelId)?.playbackRate
        ?? app.state.settings.playback.globalRate
      : app.state.settings.playback.globalRate
    return resolveSupportedRate(raw, VISTAPLAY_PLAYBACK_RATES)
  }, [app.state.channelPreferences, app.state.settings.playback.globalRate, app.state.videoPreferences, current])

  const presets = useMemo(() => {
    const values = app.state.settings.playback.speedPresets
      .map((rate) => resolveSupportedRate(rate, VISTAPLAY_PLAYBACK_RATES))
      .filter((rate, index, list) => list.indexOf(rate) === index)
    return values.length ? values : [1, 1.5, 2, 3, 4]
  }, [app.state.settings.playback.speedPresets])

  useEffect(() => {
    const host = hostRef.current
    if (!host || !current) return
    const controller = new AbortController()
    const position = app.state.lastPlayer?.videoId === current.videoId
      ? app.state.lastPlayer.position
      : app.state.history[current.videoId]?.position ?? 0

    playbackOrchestrator.pause()
    host.replaceChildren()
    setResolverState('resolving')
    setResolverError('')
    setSourceLabel('')

    void resolveYoutubeMedia(current.videoId, controller.signal)
      .then((media) => {
        if (controller.signal.aborted) return
        const stream = selectInitialStream(media.streams)
        const instance = new URL(media.resolver.instance).host
        setSourceLabel(`${media.resolver.type} · ${instance}${stream.qualityLabel ? ` · ${stream.qualityLabel}` : ''}`)
        return playbackOrchestrator.mountMedia(host, {
          provider: 'web',
          src: stream.url,
          mimeType: stream.mimeType,
        }, position, preferredRate)
      })
      .then(() => {
        if (!controller.signal.aborted) setResolverState('ready')
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        playbackOrchestrator.destroy()
        setResolverState('error')
        setResolverError(error instanceof Error ? error.message : '再生ソースを取得できませんでした')
      })

    return () => controller.abort()
  }, [current?.videoId])

  useEffect(() => {
    if (current) playbackOrchestrator.setDesiredRate(preferredRate)
  }, [current?.videoId, preferredRate])

  useEffect(() => {
    if (!current) return
    const videoId = current.videoId
    const save = () => {
      const { player, recordProgress } = latestPlayback.current
      if (player.position > 0) recordProgress(videoId, player.position, player.duration)
    }
    const timer = window.setInterval(save, 5000)
    const onVisibility = () => { if (document.visibilityState === 'hidden') save() }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', save)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', save)
      save()
    }
  }, [current?.videoId])

  if (!current) return null

  const seekSeconds = app.state.settings.playback.seekSeconds
  const maxPosition = app.player.duration || 1
  const position = Math.min(app.player.position, maxPosition)

  return <section className={`persistent-player ${full ? 'player-full' : 'player-mini'}`} aria-label="VistaPlay動画プレイヤー">
    <div className="player-frame" ref={frameRef}>
      <div className="vistaplay-media-host" ref={hostRef} />
      {resolverState === 'resolving' && <div className="player-resolver-state" role="status"><strong>再生ソースを取得中</strong><span>Piped resolver poolを確認しています…</span></div>}
      {(resolverState === 'error' || app.player.state === 'error') && <div className="player-error" role="alert"><strong>再生できません</strong><span>{resolverError || app.player.error || 'Media playback failed'}</span><a href={`https://www.youtube.com/watch?v=${current.videoId}`} target="_blank" rel="noreferrer">YouTubeで開く</a></div>}
    </div>
    <div className="player-control-shell">
      {!full && <button className="mini-title" onClick={() => navigate(`/watch?v=${current.videoId}`)}><strong>{current.title}</strong><span>{current.channelTitle ?? sourceLabel}</span></button>}
      <div className="timeline-row">
        <span>{formatDuration(app.player.position)}</span>
        <input type="range" min="0" max={maxPosition} step="0.1" value={position} onChange={(event) => playbackOrchestrator.seekTo(Number(event.target.value))} aria-label="再生位置" />
        <span>{formatDuration(app.player.duration)}</span>
      </div>
      <div className="controls-row">
        <button className="icon-button" onClick={() => playbackOrchestrator.seekBy(-seekSeconds)} aria-label={`${seekSeconds}秒戻る`}><RotateCcw /></button>
        <button className="play-button" disabled={resolverState !== 'ready'} onClick={() => playbackOrchestrator.toggle()} aria-label={app.player.state === 'playing' ? '一時停止' : '再生'}>{app.player.state === 'playing' ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}</button>
        <button className="icon-button" onClick={() => playbackOrchestrator.seekBy(seekSeconds)} aria-label={`${seekSeconds}秒進む`}><RotateCw /></button>
        {full && <PlaybackRateControl player={app.player} presets={presets} onRate={(rate) => playbackOrchestrator.setDesiredRate(rate)} />}
        <span className="control-spacer" />
        <button className="icon-button" onClick={() => playbackOrchestrator.toggleMute()} aria-label="ミュート切替">{app.player.muted ? <VolumeX /> : <Volume2 />}</button>
        {full && <label className="volume-control"><span className="sr-only">音量</span><input type="range" min="0" max="100" value={app.player.volume} onChange={(event) => playbackOrchestrator.setVolume(Number(event.target.value))} /></label>}
        <button className="icon-button" onClick={() => void toggleFullscreen(frameRef.current)} aria-label="Fullscreen"><Maximize2 /></button>
        {!full && <button className="icon-button" onClick={app.closePlayer} aria-label="プレイヤーを閉じる"><X /></button>}
      </div>
      {sourceLabel && <div className="player-source-label">Media source: {sourceLabel} · 実再生 {app.player.actualRate}x</div>}
    </div>
  </section>
}
