import { GitCompareArrows, Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { parseYouTubeVideoId, verifyVideoIds } from '../lib/youtube'
import { useApp } from '../store/AppStore'

export default function ComparePage() {
  const app = useApp()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [aInput, setAInput] = useState(params.get('a') ?? '')
  const [bInput, setBInput] = useState(params.get('b') ?? '')
  const loadRequest = useRef<AbortController | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const [pairError, setPairError] = useState('')
  const rawA = params.get('a') ?? ''
  const rawB = params.get('b') ?? ''
  const a = parseYouTubeVideoId(rawA)
  const b = parseYouTubeVideoId(rawB)
  const comparable = Boolean(a && b && a !== b)

  useEffect(() => { setAInput(rawA); setBInput(rawB) }, [rawA, rawB])
  useEffect(() => () => loadRequest.current?.abort(), [])

  const load = async () => {
    const first = parseYouTubeVideoId(aInput)
    const second = parseYouTubeVideoId(bInput)
    if (!first || !second || first === second) {
      app.notify('異なる2つのVideo IDまたはURLを指定してください', 'error')
      return
    }
    loadRequest.current?.abort()
    const controller = new AbortController()
    loadRequest.current = controller
    setLoading(true)
    setPairError('')
    try {
      const result = await verifyVideoIds([first, second], controller.signal)
      if (controller.signal.aborted) return
      if (result.invalid.length) {
        setPairError('利用可能な公開動画を2本指定してください。')
        return
      }
      app.upsertVideos(result.valid)
      setParams({ a: first, b: second })
    } catch {
      if (!controller.signal.aborted) setParams({ a: first, b: second })
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }

  return <div className="page compare-page">
    <div className="page-heading"><div><span className="eyebrow">SIDE BY SIDE</span><h1>Compare</h1><p>旧IFrame再生経路は削除済みです。比較再生は新Playback経路へ再実装します。</p></div></div>
    <div className="compare-picker">
      <label>Video A<input value={aInput} onChange={(event) => setAInput(event.target.value)} placeholder="YouTube URL / Video ID" /></label>
      <label>Video B<input value={bInput} onChange={(event) => setBInput(event.target.value)} placeholder="YouTube URL / Video ID" /></label>
      <button className="primary-button" disabled={loading} onClick={() => void load()}><Search />{loading ? '確認中…' : '読み込む'}</button>
    </div>
    {pairError && <div className="capability-notice" role="alert"><GitCompareArrows /><div><strong>比較対象を確認できません</strong><p>{pairError}</p></div></div>}
    {comparable && !pairError && a && b ? <>
      <div className="compare-workspace">
        <div><div className="compare-frame" /><h2>{app.state.videos[a]?.title ?? `Video ${a}`}</h2><button className="text-button" onClick={() => navigate(`/watch?v=${a}`)}>Watchで開く</button></div>
        <div><div className="compare-frame" /><h2>{app.state.videos[b]?.title ?? `Video ${b}`}</h2><button className="text-button" onClick={() => navigate(`/watch?v=${b}`)}>Watchで開く</button></div>
      </div>
      <div className="capability-notice"><GitCompareArrows /><div><strong>再生経路を再構築中</strong><p>新しいHTMLMediaElementベースのPlayback経路が接続されるまで比較再生は停止しています。</p></div></div>
    </> : !pairError && <div className="compare-empty"><GitCompareArrows /><h2>比較する2本を選択</h2><p>Video Cardの長押しメニューから1本目を追加することもできます。</p></div>}
  </div>
}
