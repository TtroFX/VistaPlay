import { GitCompareArrows, PauseCircle, Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { parseYouTubeVideoId, verifyVideoIds } from '../lib/youtube'
import { loadYouTubeApi, playerEngine, type YouTubePlayer } from '../player/PlayerEngine'
import { useApp } from '../store/AppStore'

export default function ComparePage() {
  const app = useApp(); const navigate = useNavigate(); const [params, setParams] = useSearchParams(); const [aInput, setAInput] = useState(params.get('a') ?? ''); const [bInput, setBInput] = useState(params.get('b') ?? '')
  const aHost = useRef<HTMLDivElement>(null); const bHost = useRef<HTMLDivElement>(null); const players = useRef<{ a?: YouTubePlayer; b?: YouTubePlayer }>({})
  const loadRequest = useRef<AbortController | undefined>(undefined); const [loading, setLoading] = useState(false); const [pairError, setPairError] = useState('')
  const rawA = params.get('a') ?? ''; const rawB = params.get('b') ?? ''; const a = parseYouTubeVideoId(rawA); const b = parseYouTubeVideoId(rawB); const comparable = Boolean(a && b && a !== b)
  useEffect(() => { setAInput(rawA); setBInput(rawB) }, [rawA, rawB])
  useEffect(() => {
    playerEngine.pause(); setPairError('')
    if (!comparable || !a || !b || !aHost.current || !bHost.current) return
    const controller = new AbortController(); let active = true
    void (async () => {
      try {
        const checked = await verifyVideoIds([a, b], controller.signal)
        if (!active) return
        if (checked.invalid.length) { setPairError('利用可能な公開動画を2本指定してください。'); return }
        app.upsertVideos(checked.valid)
      } catch { /* Data API unavailable: the official embed remains the capability fallback. */ }
      if (!active || !aHost.current || !bHost.current) return
      try {
        const YT = await loadYouTubeApi()
        if (!active || !aHost.current || !bHost.current) return
        players.current.a = new YT.Player(aHost.current, { videoId: a, width: '100%', height: '100%', playerVars: { controls: 1, playsinline: 1, origin: window.location.origin }, events: { onStateChange: (event: { data: number }) => { if (event.data === 1) players.current.b?.pauseVideo() } } })
        players.current.b = new YT.Player(bHost.current, { videoId: b, width: '100%', height: '100%', playerVars: { controls: 1, playsinline: 1, origin: window.location.origin }, events: { onStateChange: (event: { data: number }) => { if (event.data === 1) players.current.a?.pauseVideo() } } })
      } catch (error) { if (active) setPairError(error instanceof Error ? error.message : 'Compare playerを初期化できませんでした') }
    })()
    return () => { active = false; controller.abort(); players.current.a?.destroy(); players.current.b?.destroy(); players.current = {} }
  }, [a, b, comparable])
  useEffect(() => () => loadRequest.current?.abort(), [])
  const load = async () => {
    const first = parseYouTubeVideoId(aInput), second = parseYouTubeVideoId(bInput)
    if (!first || !second || first === second) { app.notify('異なる2つのVideo IDまたはURLを指定してください', 'error'); return }
    loadRequest.current?.abort(); const controller = new AbortController(); loadRequest.current = controller; setLoading(true); setPairError('')
    try {
      const result = await verifyVideoIds([first, second], controller.signal)
      if (controller.signal.aborted) return
      if (result.invalid.length) { setPairError('利用可能な公開動画を2本指定してください。'); return }
      app.upsertVideos(result.valid); setParams({ a: first, b: second })
    } catch { if (!controller.signal.aborted) setParams({ a: first, b: second }) }
    finally { if (!controller.signal.aborted) setLoading(false) }
  }
  const align = () => { const source = players.current.a, target = players.current.b; if (!source || !target) return; const durationA = source.getDuration(), durationB = target.getDuration(); if (durationA && durationB) target.seekTo(source.getCurrentTime() / durationA * durationB, true) }
  return <div className="page compare-page"><div className="page-heading"><div><span className="eyebrow">SIDE BY SIDE</span><h1>Compare</h1><p>同時再生は禁止。片方がPlayになると、もう片方を自動Pauseします。</p></div></div><div className="compare-picker"><label>Video A<input value={aInput} onChange={(e) => setAInput(e.target.value)} placeholder="YouTube URL / Video ID" /></label><label>Video B<input value={bInput} onChange={(e) => setBInput(e.target.value)} placeholder="YouTube URL / Video ID" /></label><button className="primary-button" disabled={loading} onClick={() => void load()}><Search />{loading ? '確認中…' : '読み込む'}</button></div>{pairError && <div className="capability-notice" role="alert"><GitCompareArrows /><div><strong>比較を開始できません</strong><p>{pairError}</p></div></div>}{comparable && !pairError && a && b ? <><div className="compare-workspace"><div><div className="compare-frame" ref={aHost} /><h2>{app.state.videos[a]?.title ?? `Video ${a}`}</h2><button className="text-button" onClick={() => navigate(`/watch?v=${a}`)}>Watchで開く</button></div><div><div className="compare-frame" ref={bHost} /><h2>{app.state.videos[b]?.title ?? `Video ${b}`}</h2><button className="text-button" onClick={() => navigate(`/watch?v=${b}`)}>Watchで開く</button></div></div><div className="compare-tools"><button className="secondary-button" onClick={() => { players.current.a?.pauseVideo(); players.current.b?.pauseVideo() }}><PauseCircle />両方Pause</button><button className="primary-button" onClick={align}><GitCompareArrows />Aと同じ割合へBを移動</button></div></> : !pairError && <div className="compare-empty"><GitCompareArrows /><h2>比較する2本を選択</h2><p>Video Cardの長押しメニューから1本目を追加することもできます。</p></div>}</div>
}
