import { Bot, CheckCircle2, Clipboard, ExternalLink, FileJson, ShieldCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { VideoCard } from '../components/VideoCard'
import type { Recommendation } from '../domain/types'
import { buildRecommendationPrompt, parseAIImport } from '../lib/aiBridge'
import { verifyVideoIds } from '../lib/youtube'
import { useApp } from '../store/AppStore'

export default function AIPage() {
  const app = useApp()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const videoId = params.get('video')
  const current = videoId ? app.state.videos[videoId] : undefined
  const promptEnabled = app.feature('aiPromptBuilder')
  const importEnabled = app.feature('aiImport')
  const smartSearchEnabled = app.feature('aiSmartSearch')
  const shortsEnabled = app.feature('shorts')
  const liveEnabled = app.feature('live')
  const [preset, setPreset] = useState(current ? 'この動画に似たもの' : '初心者向け')
  const [question, setQuestion] = useState('')
  const [count, setCount] = useState(8)
  const [duration, setDuration] = useState('指定なし')
  const [language, setLanguage] = useState('日本語')
  const [shorts, setShorts] = useState(false)
  const [live, setLive] = useState(false)
  const [history, setHistory] = useState(false)
  const [input, setInput] = useState('')
  const [status, setStatus] = useState('')
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const prompt = useMemo(() => buildRecommendationPrompt({
    preset,
    question,
    count,
    duration,
    language,
    shorts: shortsEnabled && shorts,
    live: liveEnabled && live,
    excludeWatched: true,
    currentVideo: current,
    recentHistory: history
      ? Object.values(app.state.history)
          .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
          .slice(0, 20)
          .map((progress) => app.state.videos[progress.videoId])
          .filter(Boolean)
      : undefined,
  }), [preset, question, count, duration, language, shortsEnabled, shorts, liveEnabled, live, history, current, app.state.history, app.state.videos])

  async function copyPrompt() {
    if (!promptEnabled) return
    await navigator.clipboard.writeText(prompt)
    app.notify('PromptをClipboardへコピーしました', 'success')
  }

  async function importJson() {
    if (!importEnabled) return
    setStatus('JSONを検証中…')
    try {
      const parsed = parseAIImport(input)
      if (parsed.type === 'youtube_search') {
        if (!smartSearchEnabled) throw new Error('Smart SearchはSettingsで無効です')
        const cutoff = Date.now() - 30 * 86400000
        const entry = {
          id: crypto.randomUUID(),
          query: parsed.searches.map((item) => item.query).join(' / '),
          videoIds: [],
          createdAt: new Date().toISOString(),
        }
        app.replaceState({
          ...app.state,
          aiImportHistory: [entry, ...app.state.aiImportHistory.filter((item) => Date.parse(item.createdAt) >= cutoff)].slice(0, 50),
          revision: app.state.revision + 1,
          updatedAt: new Date().toISOString(),
        })
        sessionStorage.setItem('vistaplay-smart-search', JSON.stringify(parsed))
        setStatus(`${parsed.searches.length}件の検索Queryを検証しました。`)
        navigate(`/search?q=${encodeURIComponent(parsed.searches[0].query)}`)
        return
      }

      setStatus('YouTube側でVideo IDを再検証中…')
      const checked = await verifyVideoIds(parsed.items.map((item) => item.videoId))
      app.upsertVideos(checked.valid)
      const metadata = new Map(checked.valid.map((video) => [video.videoId, video]))
      const next = parsed.items
        .filter((item) => metadata.has(item.videoId))
        .map((item) => ({ video: metadata.get(item.videoId)!, reason: item.reason, priority: item.priority, source: 'chatgpt' as const }))
        .sort((a, b) => a.priority - b.priority)
      setRecommendations(next)
      const cutoff = Date.now() - 30 * 86400000
      const entry = { id: crypto.randomUUID(), query: parsed.query, videoIds: next.map((item) => item.video.videoId), createdAt: new Date().toISOString() }
      app.replaceState({
        ...app.state,
        aiImportHistory: [entry, ...app.state.aiImportHistory.filter((item) => Date.parse(item.createdAt) >= cutoff)].slice(0, 50),
        revision: app.state.revision + 1,
        updatedAt: new Date().toISOString(),
      })
      setStatus(`${next.length}件を確認済み。${checked.invalid.length}件の無効・非公開候補を隔離しました。${parsed.warnings.length ? ` ${parsed.warnings.length} warning.` : ''}`)
    } catch (error) {
      setRecommendations([])
      setStatus(`拒否: ${error instanceof Error ? error.message : 'Invalid import'}`)
    }
  }

  return <div className="page ai-page">
    <div className="page-heading"><div><span className="eyebrow"><Bot />CLIPBOARD BRIDGE</span><h1>ChatGPT Recommendations</h1><p>OpenAI APIは使いません。Promptをcopyし、ChatGPTのstrict JSONを貼り付けます。</p></div></div>
    {!promptEnabled && !importEnabled && <div className="capability-notice"><ShieldCheck /><div><strong>ChatGPT Bridgeの機能は無効です</strong><p>Prompt BuilderまたはAI ImportをSettingsで有効にすると利用できます。</p></div></div>}
    <div className="ai-flow">
      {promptEnabled && <section className="ai-builder">
        <div className="flow-step"><span>1</span><div><h2>条件を決める</h2><p>全履歴は標準で渡しません。</p></div></div>
        <div className="preset-grid">{['この動画に似たもの', 'もっと詳しい', '初心者向け', '上級者向け', '短時間', '別視点', '自由質問'].map((item) => <button className={preset === item ? 'active' : ''} key={item} onClick={() => setPreset(item)}>{item}</button>)}</div>
        <label>自由質問<textarea value={question} onChange={(event) => setQuestion(event.target.value)} /></label>
        <div className="condition-grid">
          <label>本数<input type="number" min="1" max="20" value={count} onChange={(event) => setCount(Number(event.target.value))} /></label>
          <label>Duration<select value={duration} onChange={(event) => setDuration(event.target.value)}><option>指定なし</option><option>10分未満</option><option>10–30分</option><option>30分以上</option></select></label>
          <label>Language<input value={language} onChange={(event) => setLanguage(event.target.value)} /></label>
          {shortsEnabled && <label className="check-label"><input type="checkbox" checked={shorts} onChange={(event) => setShorts(event.target.checked)} />Shorts可</label>}
          {liveEnabled && <label className="check-label"><input type="checkbox" checked={live} onChange={(event) => setLive(event.target.checked)} />Live可</label>}
          <label className="check-label"><input type="checkbox" checked={history} onChange={(event) => setHistory(event.target.checked)} />最近の視聴履歴を参考にする（最大20件）</label>
        </div>
        <textarea className="prompt-preview" value={prompt} readOnly />
        <div className="builder-actions"><button className="primary-button" onClick={() => void copyPrompt()}><Clipboard />Prompt Copy</button><a className="secondary-button" href="https://chatgpt.com/" target="_blank" rel="noreferrer"><ExternalLink />chatgpt.comを開く</a></div>
      </section>}
      {importEnabled && <section className="ai-import">
        <div className="flow-step"><span>{promptEnabled ? '2' : '1'}</span><div><h2>JSONを貼り付ける</h2><p>最大64KiB。実行可能CodeとHTMLは扱いません。</p></div></div>
        <textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder='{"version":1,"type":"youtube_recommendations",...}' />
        <button className="primary-button" onClick={() => void importJson()} disabled={!input.trim()}><ShieldCheck />Validate → YouTube Verification</button>
        {status && <div className={`import-status ${status.startsWith('拒否') ? 'error' : ''}`}><FileJson /><span>{status}</span></div>}
      </section>}
    </div>
    {importEnabled && recommendations.length > 0 && <section className="content-section ai-results"><div className="section-heading"><div><span className="section-kicker"><CheckCircle2 /></span><h2>Verified Recommendations</h2></div></div><div className="video-grid">{recommendations.map((item) => <div className="recommendation-card" key={item.video.videoId}><VideoCard video={item.video} /><p><strong>#{item.priority}</strong>{item.reason}</p></div>)}</div></section>}
  </div>
}
