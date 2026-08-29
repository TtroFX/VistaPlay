import { Bot, Filter, ListPlus, Play, Search, SlidersHorizontal, UserRound, X } from 'lucide-react'
import { FormEvent, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { EmptyState, LoadingCards } from '../components/EmptyState'
import { VideoCard } from '../components/VideoCard'
import type { SearchFilters, SearchResult } from '../domain/types'
import { CapabilityError, parseYouTubeInput, searchRemote } from '../lib/youtube'
import { applyVisibilityRules } from '../lib/videoRules'
import { useApp } from '../store/AppStore'

const defaults: SearchFilters = { type: 'video', duration: 'any', live: 'any', excludeChannels: [], excludeKeywords: [], shorts: 'include', whitelistOnly: false }
const RESTORE_KEY = 'vistaplay-search-state'

export default function SearchPage() {
  const app = useApp()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const restored = useRef<null | { query: string; filters: SearchFilters; results: SearchResult[]; next?: string; scroll: number }>(null)
  if (!restored.current) { try { restored.current = JSON.parse(sessionStorage.getItem(RESTORE_KEY) ?? 'null') } catch { restored.current = null } }
  const [query, setQuery] = useState(params.get('q') ?? restored.current?.query ?? '')
  const [filters, setFilters] = useState<SearchFilters>(restored.current?.filters ?? defaults)
  const [results, setResults] = useState<SearchResult[]>(restored.current?.results ?? [])
  const [next, setNext] = useState<string | undefined>(restored.current?.next)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  useEffect(() => { window.scrollTo(0, restored.current?.scroll ?? 0); return () => sessionStorage.setItem(RESTORE_KEY, JSON.stringify({ query, filters, results, next, scroll: window.scrollY })) }, [])
  useEffect(() => { if (params.get('q') && !results.length) void runSearch(false) }, [])

  async function runSearch(append: boolean, event?: FormEvent) {
    event?.preventDefault(); if (!query.trim()) return
    const parsed = parseYouTubeInput(query)
    if (parsed) { navigate(parsed.type === 'video' ? `/watch?v=${parsed.id}` : parsed.type === 'channel' ? `/channel/${parsed.id}` : `/playlist/${parsed.id}`); return }
    setLoading(true); setError(''); setParams({ q: query.trim() })
    try {
      const response = await searchRemote(query.trim(), filters, append ? next : undefined)
      const visible = response.items.filter((item) => item.video ? applyVisibilityRules([item.video], app.state.settings).length > 0 : !app.state.settings.blacklist.channels.includes(item.id) && (!app.state.settings.whitelistOnly || app.state.settings.whitelistChannels.includes(item.id)))
      setResults((items) => append ? [...items, ...visible] : visible)
      setNext(response.nextPageToken)
      app.addSearchHistory(query.trim())
      app.upsertVideos(visible.map((item) => item.video).filter(Boolean) as any)
    } catch (reason) { setError(reason instanceof CapabilityError ? reason.message : reason instanceof Error ? reason.message : '検索に失敗しました') }
    finally { setLoading(false) }
  }

  function openResult(result: SearchResult) {
    if (result.type === 'video' && result.video) { app.playVideo(result.video); navigate(`/watch?v=${result.id}`) }
    else navigate(result.type === 'channel' ? `/channel/${result.id}` : `/playlist/${result.id}`)
  }

  return <div className="page search-page">
    <div className="page-heading"><div><span className="eyebrow">DISCOVER</span><h1>Search</h1><p>入力後に明示的に検索します。結果は25件ずつ、6時間cacheされます。</p></div>{app.feature('chatgpt') && <button className="ai-button" onClick={() => navigate('/ai')}><Bot />AIに探してもらう</button>}</div>
    <form className="search-workbench" onSubmit={(event) => void runSearch(false, event)}>
      <div className="large-search"><Search /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="検索語、YouTube URL、Video ID" /><button type="button" className="icon-button" onClick={() => setQuery('')} aria-label="入力を消去"><X /></button><button className="primary-button">検索</button></div>
      <div className="filter-bar">
        {(['video', 'channel', 'playlist'] as const).map((type) => <button type="button" className={`filter-chip ${filters.type === type ? 'active' : ''}`} onClick={() => setFilters({ ...filters, type })} key={type}>{type === 'video' ? <Play /> : type === 'channel' ? <UserRound /> : <ListPlus />}{type}</button>)}
        {app.feature('advancedSearch') && <button type="button" className={`filter-chip ${showFilters ? 'active' : ''}`} onClick={() => setShowFilters((value) => !value)}><SlidersHorizontal />詳細Filter</button>}
      </div>
      {showFilters && app.feature('advancedSearch') && <div className="advanced-filters">
        <label>公開日<input type="date" value={filters.publishedAfter ?? ''} onChange={(e) => setFilters({ ...filters, publishedAfter: e.target.value || undefined })} /></label>
        <label>長さ<select value={filters.duration} onChange={(e) => setFilters({ ...filters, duration: e.target.value as SearchFilters['duration'] })}><option value="any">指定なし</option><option value="short">4分未満</option><option value="medium">4–20分</option><option value="long">20分超</option></select></label>
        {app.feature('live') && <label>Live<select value={filters.live} onChange={(e) => setFilters({ ...filters, live: e.target.value as SearchFilters['live'] })}><option value="any">含む</option><option value="live">配信中</option><option value="upcoming">配信予定</option></select></label>}
        {app.feature('shorts') && <label>Shorts<select value={filters.shorts} onChange={(e) => setFilters({ ...filters, shorts: e.target.value as SearchFilters['shorts'] })}><option value="include">含む</option><option value="exclude">除外</option><option value="only">Shortsのみ</option></select></label>}
        <label>除外Keyword<input value={filters.excludeKeywords.join(', ')} onChange={(e) => setFilters({ ...filters, excludeKeywords: e.target.value.split(',').map((v) => v.trim()).filter(Boolean) })} placeholder="comma区切り" /></label>
        <label>除外Channel ID<input value={filters.excludeChannels.join(', ')} onChange={(e) => setFilters({ ...filters, excludeChannels: e.target.value.split(',').map((v) => v.trim()).filter(Boolean) })} /></label>
      </div>}
    </form>
    {error && <div className="capability-notice"><Filter /><div><strong>検索Capabilityを利用できません</strong><p>{error}</p><span>URL / 11文字Video IDからの直接再生とlocal Library検索は利用できます。</span></div></div>}
    {loading && !results.length ? <LoadingCards /> : results.length ? <>
      <div className={filters.type === 'video' ? 'video-grid' : 'entity-list'}>{results.map((result) => result.video ? <VideoCard video={result.video} key={result.id} /> : <button className="entity-result" key={result.id} onClick={() => openResult(result)}>{result.thumbnail ? <img src={result.thumbnail} alt="" /> : <span className="entity-placeholder"><UserRound /></span>}<span><strong>{result.title}</strong><small>{result.description}</small></span></button>)}</div>
      {next && <button className="secondary-button load-more" disabled={loading} onClick={() => void runSearch(true)}>{loading ? '読み込み中…' : 'さらに表示'}</button>}
    </> : !loading && <EmptyState icon={Search} title="検索結果がここに表示されます" description="検索語を入力して検索ボタンを押してください。文字入力ごとのAPI requestは行いません。" />}
  </div>
}
