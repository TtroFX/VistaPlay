import { Bot, Filter, ListPlus, Play, Search, SlidersHorizontal, UserRound, X } from 'lucide-react'
import { FormEvent, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useNavigationType, useSearchParams } from 'react-router-dom'
import { EmptyState, LoadingCards } from '../components/EmptyState'
import { VideoCard } from '../components/VideoCard'
import type { SearchFilters, SearchResult } from '../domain/types'
import { parseSmartSearch, type SmartSearchImport } from '../lib/aiBridge'
import { filterAndSortSearchResults, searchLocalVideos, type SearchSort } from '../lib/searchRules'
import { useTemporaryHistory } from '../lib/useTemporaryHistory'
import { CapabilityError, parseYouTubeInput, searchRemote } from '../lib/youtube'
import { useApp } from '../store/AppStore'

const defaults: SearchFilters = { type: 'video', duration: 'any', live: 'any', excludeChannels: [], excludeKeywords: [], shorts: 'include', whitelistOnly: false }
const RESTORE_KEY = 'vistaplay-search-state'
type RestoredSearch = { query: string; filters: SearchFilters; results: SearchResult[]; next?: string; sort?: SearchSort; scroll: number }

export default function SearchPage() {
  const app = useApp()
  const location = useLocation()
  const navigationType = useNavigationType()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [smartSearch] = useState<SmartSearchImport | null>(() => {
    const raw = sessionStorage.getItem('vistaplay-smart-search')
    if (!raw) return null
    sessionStorage.removeItem('vistaplay-smart-search')
    if (!app.feature('aiSmartSearch')) return null
    try { return parseSmartSearch(raw) } catch { return null }
  })
  const restored = useRef<RestoredSearch | null>(null)
  if (!restored.current) { try { restored.current = JSON.parse(sessionStorage.getItem(RESTORE_KEY) ?? 'null') } catch { restored.current = null } }
  const requestedQuery = params.get('q')
  const isHistoryReturn = navigationType === 'POP' && location.key !== 'default'
  const canRestore = isHistoryReturn && !smartSearch && Boolean(restored.current) && (!requestedQuery || requestedQuery === restored.current?.query)
  const [query, setQuery] = useState(smartSearch?.searches[0].query ?? requestedQuery ?? (canRestore ? restored.current?.query : '') ?? '')
  const [filters, setFilters] = useState<SearchFilters>(canRestore ? restored.current?.filters ?? defaults : defaults)
  const [results, setResults] = useState<SearchResult[]>(canRestore ? restored.current?.results ?? [] : [])
  const [next, setNext] = useState<string | undefined>(canRestore ? restored.current?.next : undefined)
  const [sort, setSort] = useState<SearchSort>(canRestore ? restored.current?.sort ?? 'relevance' : 'relevance')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [smartSummary, setSmartSummary] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const searchRequest = useRef<AbortController | undefined>(undefined)
  const searchGeneration = useRef(0)
  const dismissFilters = useTemporaryHistory(showFilters, () => setShowFilters(false), 'search-filters')
  const latest = useRef<RestoredSearch>({ query, filters, results, next, sort, scroll: canRestore ? restored.current?.scroll ?? 0 : 0 })
  latest.current = { query, filters, results, next, sort, scroll: latest.current.scroll }

  useLayoutEffect(() => {
    if (!canRestore) return
    const top = restored.current?.scroll ?? 0
    const root = document.documentElement
    const priorBehavior = root.style.scrollBehavior
    root.style.scrollBehavior = 'auto'
    window.scrollTo(0, top)
    root.scrollTop = top
    document.body.scrollTop = top
    root.style.scrollBehavior = priorBehavior
  }, [])

  useEffect(() => {
    const trackScroll = () => { latest.current.scroll = window.scrollY }
    window.addEventListener('scroll', trackScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', trackScroll)
      sessionStorage.setItem(RESTORE_KEY, JSON.stringify(latest.current))
    }
  }, [])
  useEffect(() => { if (smartSearch) void runSmartSearch(smartSearch); else if (params.get('q') && !results.length) void runSearch(false) }, [])
  useEffect(() => {
    if (!requestedQuery || requestedQuery === query) return
    setQuery(requestedQuery)
    void runSearch(false, undefined, requestedQuery)
  }, [requestedQuery])
  useEffect(() => () => searchRequest.current?.abort(), [])

  function beginSearchRequest() {
    searchRequest.current?.abort()
    const controller = new AbortController()
    searchRequest.current = controller
    return { controller, generation: ++searchGeneration.current }
  }

  async function runSmartSearch(document: SmartSearchImport) {
    const { controller, generation } = beginSearchRequest()
    setLoading(true); setError(''); setNext(undefined); setParams({ q: document.searches[0].query })
    const combined: SearchResult[] = []
    let failures = 0
    let firstFailure = ''
    try {
      for (let offset = 0; offset < document.searches.length; offset += 3) {
        const outcomes = await Promise.all(document.searches.slice(offset, offset + 3).map(async (search) => {
          const shortsAllowed = app.feature('shorts') && search.filters?.shorts !== false
          const liveAllowed = app.feature('live') && search.filters?.live !== false
          const smartFilters: SearchFilters = { ...defaults, shorts: shortsAllowed ? 'include' : 'exclude' }
          try {
            const response = await searchRemote(search.query, smartFilters, undefined, controller.signal)
            return { search, items: filterAndSortSearchResults(response.items, app.state.settings, { shorts: shortsAllowed, live: liveAllowed, whitelistOnly: false, sort }) }
          } catch (reason) { return { search, reason } }
        }))
        if (controller.signal.aborted || searchGeneration.current !== generation) return
        for (const outcome of outcomes) {
          if (outcome.items !== undefined) {
            combined.push(...outcome.items)
            app.addSearchHistory(outcome.search.query)
          } else {
            failures += 1
            if (!firstFailure) firstFailure = outcome.reason instanceof Error ? outcome.reason.message : 'Smart Search query failed'
          }
        }
      }
      if (searchGeneration.current !== generation) return
      const deduped = [...new Map(combined.map((item) => [`${item.type}:${item.id}`, item])).values()]
      setResults(deduped)
      app.upsertVideos(deduped.map((item) => item.video).filter(Boolean) as NonNullable<SearchResult['video']>[])
      setSmartSummary(`${document.searches.length} queriesから${deduped.length}件を統合${failures ? `（${failures}件失敗）` : ''}`)
      if (!deduped.length && failures) setError(firstFailure)
    } finally {
      if (searchGeneration.current === generation) setLoading(false)
    }
  }

  async function runSearch(append: boolean, event?: FormEvent, queryOverride?: string) {
    event?.preventDefault()
    const searchQuery = (queryOverride ?? query).trim()
    if (!searchQuery) return
    const parsed = parseYouTubeInput(searchQuery)
    if (parsed) {
      searchRequest.current?.abort()
      sessionStorage.setItem(RESTORE_KEY, JSON.stringify({ ...latest.current, scroll: window.scrollY }))
      navigate(parsed.type === 'video' ? `/watch?v=${parsed.id}` : parsed.type === 'channel' ? `/channel/${parsed.id}` : `/playlist/${parsed.id}`)
      return
    }
    const { controller, generation } = beginSearchRequest()
    setLoading(true); setError(''); setParams({ q: searchQuery })
    if (!append) { setResults([]); setNext(undefined); setSmartSummary('') }
    const effectiveFilters = app.feature('advancedSearch') ? { ...filters } : { ...defaults, type: filters.type }
    if (!app.feature('shorts')) effectiveFilters.shorts = 'exclude'
    if (!app.feature('live')) effectiveFilters.live = 'any'
    try {
      const response = await searchRemote(searchQuery, effectiveFilters, append ? next : undefined, controller.signal)
      if (searchGeneration.current !== generation) return
      const combined = append ? [...results, ...response.items] : response.items
      const visible = filterAndSortSearchResults(combined, app.state.settings, { shorts: app.feature('shorts'), live: app.feature('live'), whitelistOnly: effectiveFilters.whitelistOnly, sort })
      const deduped = [...new Map(visible.map((item) => [`${item.type}:${item.id}`, item])).values()]
      setResults(deduped)
      setNext(response.nextPageToken)
      app.addSearchHistory(searchQuery)
      app.upsertVideos(deduped.map((item) => item.video).filter(Boolean) as NonNullable<SearchResult['video']>[])
    } catch (reason) {
      if (!controller.signal.aborted && searchGeneration.current === generation) {
        const message = reason instanceof CapabilityError ? reason.message : reason instanceof Error ? reason.message : '検索に失敗しました'
        if (!append && effectiveFilters.type === 'video') {
          const local = searchLocalVideos(Object.values(app.state.videos), searchQuery, effectiveFilters)
          const visible = filterAndSortSearchResults(local, app.state.settings, { shorts: app.feature('shorts'), live: app.feature('live'), whitelistOnly: effectiveFilters.whitelistOnly, sort })
          setResults(visible); setNext(undefined); app.addSearchHistory(searchQuery)
          setError(visible.length ? `${message} この端末のLibrary metadataから${visible.length}件を表示しています。` : message)
        } else setError(message)
      }
    } finally {
      if (searchGeneration.current === generation) setLoading(false)
    }
  }

  function openResult(result: SearchResult) {
    if (result.type === 'video' && result.video) { app.playVideo(result.video); navigate(`/watch?v=${result.id}`) }
    else navigate(result.type === 'channel' ? `/channel/${result.id}` : `/playlist/${result.id}`)
  }

  return <div className="page search-page">
    <div className="page-heading"><div><span className="eyebrow">DISCOVER</span><h1>Search</h1><p>入力後に明示的に検索します。結果は25件ずつ、6時間cacheされます。</p></div>{app.feature('chatgpt') && <button className="ai-button" onClick={() => navigate('/ai')}><Bot />AIに探してもらう</button>}</div>
    <form className="search-workbench" onSubmit={(event) => void runSearch(false, event)}>
      <div className="large-search"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="検索語、YouTube URL、Video ID" /><button type="button" className="icon-button" onClick={() => setQuery('')} aria-label="入力を消去"><X /></button><button className="primary-button">検索</button></div>
      <div className="filter-bar">
        {(['video', 'channel', 'playlist'] as const).map((type) => <button type="button" className={`filter-chip ${filters.type === type ? 'active' : ''}`} onClick={() => setFilters({ ...filters, type })} key={type}>{type === 'video' ? <Play /> : type === 'channel' ? <UserRound /> : <ListPlus />}{type}</button>)}
        {app.feature('advancedSearch') && <button type="button" className={`filter-chip ${showFilters ? 'active' : ''}`} onClick={() => showFilters ? dismissFilters() : setShowFilters(true)}><SlidersHorizontal />詳細Filter</button>}
        {filters.type === 'video' && <label className="inline-select">並び順<select value={sort} onChange={(event) => setSort(event.target.value as SearchSort)}><option value="relevance">関連度</option><option value="newest">新しい順</option><option value="views">再生数順</option></select></label>}
      </div>
      {showFilters && app.feature('advancedSearch') && <div className="advanced-filters">
        <label>公開日<input type="date" value={filters.publishedAfter ?? ''} onChange={(e) => setFilters({ ...filters, publishedAfter: e.target.value || undefined })} /></label>
        <label>長さ<select value={filters.duration} onChange={(e) => setFilters({ ...filters, duration: e.target.value as SearchFilters['duration'] })}><option value="any">指定なし</option><option value="short">4分未満</option><option value="medium">4–20分</option><option value="long">20分超</option></select></label>
        {app.feature('live') && <label>Live<select value={filters.live} onChange={(e) => setFilters({ ...filters, live: e.target.value as SearchFilters['live'] })}><option value="any">含む</option><option value="live">配信中</option><option value="upcoming">配信予定</option></select></label>}
        {app.feature('shorts') && <label>Shorts<select value={filters.shorts} onChange={(e) => setFilters({ ...filters, shorts: e.target.value as SearchFilters['shorts'] })}><option value="include">含む</option><option value="exclude">除外</option><option value="only">Shortsのみ</option></select></label>}
        <label>除外Keyword<input value={filters.excludeKeywords.join(', ')} onChange={(e) => setFilters({ ...filters, excludeKeywords: e.target.value.split(',').map((v) => v.trim()).filter(Boolean) })} placeholder="comma区切り" /></label>
        <label>除外Channel ID<input value={filters.excludeChannels.join(', ')} onChange={(e) => setFilters({ ...filters, excludeChannels: e.target.value.split(',').map((v) => v.trim()).filter(Boolean) })} /></label>
        <label className="check-label"><input type="checkbox" checked={filters.whitelistOnly} onChange={(e) => setFilters({ ...filters, whitelistOnly: e.target.checked })} />Whitelist-only</label>
      </div>}
    </form>
    {smartSummary && <div className="import-status"><Bot /><span>Smart Search: {smartSummary}</span></div>}
    {!results.length && app.state.searchHistory.length > 0 && <div className="filter-bar search-history"><span>最近の検索</span>{app.state.searchHistory.slice(0, 8).map((item) => <button className="filter-chip" key={item} onClick={() => setQuery(item)}><Search />{item}</button>)}<button className="text-button" onClick={() => app.replaceState((current) => ({ ...current, searchHistory: [] }))}>履歴を消去</button></div>}
    {error && <div className="capability-notice"><Filter /><div><strong>検索Capabilityを利用できません</strong><p>{error}</p><span>URL / 11文字Video IDからの直接再生とlocal Library検索は利用できます。</span></div></div>}
    {loading && !results.length ? <LoadingCards /> : results.length ? <>
      <div className={filters.type === 'video' ? 'video-grid' : 'entity-list'}>{results.map((result) => result.video ? <VideoCard video={result.video} key={result.id} /> : <button className="entity-result" key={result.id} onClick={() => openResult(result)}>{result.thumbnail ? <img src={result.thumbnail} alt="" /> : <span className="entity-placeholder"><UserRound /></span>}<span><strong>{result.title}</strong><small>{result.description}</small></span></button>)}</div>
      {next && <button className="secondary-button load-more" disabled={loading} onClick={() => void runSearch(true)}>{loading ? '読み込み中…' : 'さらに表示'}</button>}
    </> : !loading && <EmptyState icon={Search} title="検索結果がここに表示されます" description="検索語を入力して検索ボタンを押してください。文字入力ごとのAPI requestは行いません。" />}
  </div>
}
