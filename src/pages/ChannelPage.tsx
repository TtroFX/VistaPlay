import { Heart, Radio, Settings2, UsersRound } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { EmptyState, LoadingCards } from '../components/EmptyState'
import { VideoCard } from '../components/VideoCard'
import type { ChannelPreference, VideoRef } from '../domain/types'
import { applyRuntimeFeatureRules, isLikelyShort } from '../lib/videoRules'
import { fetchChannel, listChannelVideos, type ChannelDetails } from '../lib/youtube'
import { useApp } from '../store/AppStore'

type ChannelTab = 'videos' | 'shorts' | 'live'
type ChannelKind = 'video' | 'live' | 'upcoming'

function visibleChannelVideos(videos: VideoRef[], tab: ChannelTab): VideoRef[] {
  if (tab === 'shorts') return applyRuntimeFeatureRules(videos, { shorts: true, live: false }).filter(isLikelyShort)
  if (tab === 'videos') return applyRuntimeFeatureRules(videos, { shorts: false, live: false })
  return videos
}

export default function ChannelPage() {
  const { id = '' } = useParams(); const app = useApp(); const [channel, setChannel] = useState<ChannelDetails>(); const [videos, setVideos] = useState<VideoRef[]>([]); const [tab, setTab] = useState<ChannelTab>('videos'); const [loading, setLoading] = useState(true); const [loadingMore, setLoadingMore] = useState(false); const [error, setError] = useState(''); const [nextTokens, setNextTokens] = useState<Partial<Record<ChannelKind, string>>>({})
  const request = useRef<AbortController | undefined>(undefined); const generation = useRef(0)
  const shortsEnabled = app.feature('shorts'); const liveEnabled = app.feature('live'); const upcomingEnabled = app.feature('upcoming')
  const activeTab = tab === 'shorts' && !shortsEnabled || tab === 'live' && !liveEnabled ? 'videos' : tab
  useEffect(() => { if (activeTab !== tab) setTab(activeTab) }, [activeTab, tab])
  useEffect(() => {
    request.current?.abort(); const controller = new AbortController(); request.current = controller; const currentGeneration = ++generation.current
    setLoading(true); setLoadingMore(false); setError(''); setVideos([]); setNextTokens({})
    const kinds: ChannelKind[] = activeTab === 'live' ? ['live', ...(upcomingEnabled ? ['upcoming' as const] : [])] : ['video']
    Promise.all([fetchChannel(id, controller.signal), Promise.all(kinds.map(async (kind) => ({ kind, ...await listChannelVideos(id, kind, undefined, controller.signal) }))) ]).then(([details, results]) => {
      if (generation.current !== currentGeneration) return
      setChannel(details)
      const all = [...new Map(results.flatMap((result) => result.items).map((video) => [video.videoId, video])).values()]
      setVideos(visibleChannelVideos(all, activeTab)); setNextTokens(Object.fromEntries(results.filter((result) => result.nextPageToken).map((result) => [result.kind, result.nextPageToken]))); app.upsertVideos(all)
    }).catch((reason) => { if (!controller.signal.aborted && generation.current === currentGeneration) setError(reason instanceof Error ? reason.message : 'Channel unavailable') }).finally(() => { if (generation.current === currentGeneration) setLoading(false) })
    return () => controller.abort()
  }, [activeTab, id, upcomingEnabled])
  const loadMore = async () => {
    const entries = (Object.entries(nextTokens) as Array<[ChannelKind, string]>).filter(([, token]) => token)
    if (!entries.length || loadingMore) return
    request.current?.abort(); const controller = new AbortController(); request.current = controller; const currentGeneration = ++generation.current
    setLoadingMore(true); setError('')
    try {
      const results = await Promise.all(entries.map(async ([kind, token]) => ({ kind, ...await listChannelVideos(id, kind, token, controller.signal) })))
      if (generation.current !== currentGeneration) return
      const additions = results.flatMap((result) => result.items)
      const combined = [...new Map([...videos, ...additions].map((video) => [video.videoId, video])).values()]
      setVideos(visibleChannelVideos(combined, activeTab)); setNextTokens((current) => { const updated = { ...current }; for (const result of results) { if (result.nextPageToken) updated[result.kind] = result.nextPageToken; else delete updated[result.kind] } return updated }); app.upsertVideos(additions)
    } catch (reason) { if (!controller.signal.aborted && generation.current === currentGeneration) setError(reason instanceof Error ? reason.message : '動画を追加取得できませんでした') }
    finally { if (generation.current === currentGeneration) setLoadingMore(false) }
  }
  const preference = app.state.channelPreferences.find((item) => item.channelId === id)
  const updatePref = (patch: Partial<Omit<ChannelPreference, 'channelId' | 'updatedAt'>>) => app.replaceState((current) => {
    const existing = current.channelPreferences.find((item) => item.channelId === id)
    const updated: ChannelPreference = { channelId: id, playbackRate: existing?.playbackRate, homePriority: existing?.homePriority ?? 0, hideFromHome: existing?.hideFromHome ?? false, shorts: existing?.shorts ?? 'default', queueAutoplay: existing?.queueAutoplay ?? true, ...patch, updatedAt: new Date().toISOString() }
    return { ...current, channelPreferences: [...current.channelPreferences.filter((item) => item.channelId !== id), updated] }
  })
  return <div className="page channel-page">{channel && <section className="channel-hero">{channel.thumbnail ? <img src={channel.thumbnail} alt="" /> : <span><UsersRound /></span>}<div><span className="eyebrow">CHANNEL</span><h1>{channel.title}</h1><p>{channel.description}</p><small>{channel.subscriberCount !== undefined ? `${Intl.NumberFormat('ja', { notation: 'compact' }).format(channel.subscriberCount)} subscribers` : 'Subscriber count unavailable'}</small></div><button className={`secondary-button ${preference?.homePriority ? 'active' : ''}`} onClick={() => updatePref({ homePriority: preference?.homePriority ? 0 : 1 })}><Heart />Local favorite</button></section>}
    <div className="tabs">{[['videos', 'Videos'], ...(shortsEnabled ? [['shorts', 'Shorts']] : []), ...(liveEnabled ? [['live', 'Live']] : [])].map(([key, label]) => <button className={activeTab === key ? 'active' : ''} onClick={() => setTab(key as 'videos' | 'shorts' | 'live')} key={key}>{key === 'live' ? <Radio /> : <UsersRound />}{label}</button>)}</div>
    <div className="channel-preferences"><Settings2 /><label>Playback Rate<select value={preference?.playbackRate ?? ''} onChange={(e) => updatePref({ playbackRate: e.target.value ? Number(e.target.value) : undefined })}><option value="">Global</option>{[0.75, 1, 1.25, 1.5, 1.75, 2].map((r) => <option value={r} key={r}>{r}x</option>)}</select></label><label>Home Priority<select value={preference?.homePriority ?? 0} onChange={(e) => updatePref({ homePriority: Number(e.target.value) })}><option value="0">Standard</option><option value="1">Favorite</option><option value="2">High</option></select></label>{shortsEnabled && <label>Shorts<select value={preference?.shorts ?? 'default'} onChange={(e) => updatePref({ shorts: e.target.value as ChannelPreference['shorts'] })}><option value="default">Default</option><option value="prefer">Prefer</option><option value="avoid">Avoid</option></select></label>}<label><input type="checkbox" checked={preference?.hideFromHome ?? false} onChange={(e) => updatePref({ hideFromHome: e.target.checked })} />Homeから隠す</label><label><input type="checkbox" checked={preference?.queueAutoplay ?? true} onChange={(e) => updatePref({ queueAutoplay: e.target.checked })} />Queue連続再生</label></div>
    {loading ? <LoadingCards /> : videos.length ? <><div className="video-grid">{videos.map((video) => <VideoCard video={video} key={video.videoId} />)}</div>{Object.values(nextTokens).some(Boolean) && <button className="secondary-button load-more" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? '読み込み中…' : 'さらに表示'}</button>}{error && <div className="capability-notice"><UsersRound /><div><strong>追加取得に失敗しました</strong><p>{error}</p></div></div>}</> : <EmptyState icon={UsersRound} title="表示できる動画がありません" description={error || 'このTabに該当する公開動画はありません。'} />}</div>
}
