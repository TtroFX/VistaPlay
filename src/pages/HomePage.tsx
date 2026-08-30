import { ArrowRight, History, Inbox, RefreshCw, Search, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { VideoCard } from '../components/VideoCard'
import { rankLocalRecommendations } from '../lib/localRecommendations'
import { applyAutoAddRules, applyVisibilityRules } from '../lib/videoRules'
import { fetchLatestUploads, fetchSubscriptionChannelIds } from '../lib/youtube'
import { useApp } from '../store/AppStore'
import { getGoogleAccessToken } from '../sync/supabase'

export default function HomePage() {
  const app = useApp()
  const navigate = useNavigate()
  const [refreshing, setRefreshing] = useState(false)
  const sections = useMemo(() => {
    const videos = applyVisibilityRules(Object.values(app.state.videos), app.state.settings)
    const lookup = (ids: string[]) => ids.map((id) => app.state.videos[id]).filter(Boolean)
    const continuing = Object.values(app.state.history).filter((p) => p.state === 'WATCHING').sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).map((p) => app.state.videos[p.videoId]).filter(Boolean)
    return {
      continue: continuing,
      inbox: lookup(app.state.inbox),
      new: [...videos].filter((v) => v.publishedAt).sort((a, b) => Date.parse(b.publishedAt!) - Date.parse(a.publishedAt!)).slice(0, 12),
      recommended: app.feature('customRecommendation') ? rankLocalRecommendations(videos, app.state).map((item) => item.video) : [],
      categories: [],
      favorites: lookup(app.state.favorites).slice(-12).reverse()
    }
  }, [app.state, app.feature])
  const labels: Record<string, string> = { continue: '続きから見る', inbox: 'Watch Inbox', new: '新着', recommended: 'あなた向け', categories: 'よく見るカテゴリ', favorites: '最近お気に入りに追加' }
  const visible = app.state.settings.homeOrder.filter((key) => !app.state.settings.homeHidden.includes(key) && sections[key as keyof typeof sections]?.length)
  const refresh = async () => {
    if (refreshing) return
    setRefreshing(true)
    try {
      const accessToken = await getGoogleAccessToken()
      const localChannels = app.state.channelPreferences.filter((item) => item.homePriority > 0 && !item.hideFromHome).map((item) => item.channelId)
      const subscribedChannels = accessToken ? await fetchSubscriptionChannelIds(accessToken) : []
      const channelIds = [...new Set([...subscribedChannels, ...localChannels])]
      const uploads = channelIds.length ? await fetchLatestUploads(channelIds, accessToken) : []
      if (uploads.length) app.upsertVideos(uploads)
      const candidates = applyVisibilityRules([...Object.values(app.state.videos), ...uploads], app.state.settings)
      const additions = applyAutoAddRules(candidates, app.state.autoAddRules, app.state.queue)
      if (additions.length) app.replaceState({ ...app.state, videos: { ...app.state.videos, ...Object.fromEntries(uploads.map((video) => [video.videoId, video])) }, queue: [...app.state.queue, ...additions], revision: app.state.revision + 1, updatedAt: new Date().toISOString() })
      app.notify(`${uploads.length}本の新着を更新${additions.length ? `・Queueへ${additions.length}本追加` : ''}`, 'success')
    } catch (error) {
      const candidates = applyVisibilityRules(Object.values(app.state.videos), app.state.settings)
      const additions = applyAutoAddRules(candidates, app.state.autoAddRules, app.state.queue)
      if (additions.length) app.replaceState({ ...app.state, queue: [...app.state.queue, ...additions], revision: app.state.revision + 1, updatedAt: new Date().toISOString() })
      app.notify(error instanceof Error ? error.message : '新着を更新できませんでした', 'error')
    } finally {
      setRefreshing(false)
    }
  }
  return <div className="page home-page">
    <section className="home-hero">
      <div><span className="eyebrow"><Sparkles />YOUR VIEWING WORKSPACE</span><h1>見たい動画へ、まっすぐ。</h1><p>検索、整理、再生をひとつの静かなWorkspaceにまとめます。</p></div>
      <div className="heading-actions"><button className="secondary-button" onClick={() => void refresh()} disabled={refreshing}><RefreshCw className={refreshing ? 'spin' : ''} />{refreshing ? '更新中' : 'Refresh'}</button><button className="primary-button large" onClick={() => navigate('/search')}><Search />動画を探す<ArrowRight /></button></div>
    </section>
    {!visible.length && <section className="first-run-panel">
      <div className="first-run-icon"><History /></div><div><h2>まだLibraryは空です</h2><p>YouTube URLを上の検索欄へ貼るか、Searchから最初の動画を探してください。視聴を始めるとHomeが自動で育ちます。</p></div>
      <button className="secondary-button" onClick={() => navigate('/search')}>Searchを開く</button>
    </section>}
    {visible.map((key) => <section className="content-section" key={key}>
      <div className="section-heading"><div><span className="section-kicker">{key === 'inbox' ? <Inbox /> : <Sparkles />}</span><h2>{labels[key]}</h2></div><button className="text-button" onClick={() => navigate(key === 'continue' ? '/history' : key === 'inbox' ? '/inbox' : '/library')}>すべて見る<ArrowRight /></button></div>
      <div className="video-grid">{sections[key as keyof typeof sections].map((video) => <VideoCard key={video.videoId} video={video} />)}</div>
    </section>)}
  </div>
}
