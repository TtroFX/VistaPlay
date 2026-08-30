import { Heart, Radio, Settings2, UsersRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { EmptyState, LoadingCards } from '../components/EmptyState'
import { VideoCard } from '../components/VideoCard'
import type { VideoRef } from '../domain/types'
import { applyRuntimeFeatureRules, isLikelyShort } from '../lib/videoRules'
import { fetchChannel, listChannelVideos, type ChannelDetails } from '../lib/youtube'
import { useApp } from '../store/AppStore'

export default function ChannelPage() {
  const { id = '' } = useParams(); const app = useApp(); const [channel, setChannel] = useState<ChannelDetails>(); const [videos, setVideos] = useState<VideoRef[]>([]); const [tab, setTab] = useState<'videos' | 'shorts' | 'live'>('videos'); const [loading, setLoading] = useState(true); const [error, setError] = useState('')
  const shortsEnabled = app.feature('shorts'); const liveEnabled = app.feature('live'); const upcomingEnabled = app.feature('upcoming')
  const activeTab = tab === 'shorts' && !shortsEnabled || tab === 'live' && !liveEnabled ? 'videos' : tab
  useEffect(() => { if (activeTab !== tab) setTab(activeTab) }, [activeTab, tab])
  useEffect(() => {
    const controller = new AbortController(); let active = true; setLoading(true); setError('')
    const kinds: Array<'video' | 'live' | 'upcoming'> = activeTab === 'live' ? ['live', ...(upcomingEnabled ? ['upcoming' as const] : [])] : ['video']
    Promise.all([fetchChannel(id, controller.signal), ...kinds.map((kind) => listChannelVideos(id, kind, undefined, controller.signal))]).then(([details, ...results]) => {
      if (!active) return
      setChannel(details)
      const all = [...new Map(results.flatMap((result) => result.items).map((video) => [video.videoId, video])).values()]
      const items = activeTab === 'shorts'
        ? applyRuntimeFeatureRules(all, { shorts: true, live: false }).filter(isLikelyShort)
        : activeTab === 'videos' ? applyRuntimeFeatureRules(all, { shorts: false, live: false }) : all
      setVideos(items); app.upsertVideos(all)
    }).catch((reason) => { if (active && !controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Channel unavailable') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false; controller.abort() }
  }, [activeTab, id, upcomingEnabled])
  const preference = app.state.channelPreferences.find((item) => item.channelId === id)
  const updatePref = (patch: object) => app.replaceState({ ...app.state, channelPreferences: [...app.state.channelPreferences.filter((item) => item.channelId !== id), { channelId: id, playbackRate: preference?.playbackRate, homePriority: preference?.homePriority ?? 0, hideFromHome: preference?.hideFromHome ?? false, shorts: preference?.shorts ?? 'default', queueAutoplay: preference?.queueAutoplay ?? true, ...patch, updatedAt: new Date().toISOString() }], revision: app.state.revision + 1, updatedAt: new Date().toISOString() })
  return <div className="page channel-page">{channel && <section className="channel-hero">{channel.thumbnail ? <img src={channel.thumbnail} alt="" /> : <span><UsersRound /></span>}<div><span className="eyebrow">CHANNEL</span><h1>{channel.title}</h1><p>{channel.description}</p><small>{channel.subscriberCount !== undefined ? `${Intl.NumberFormat('ja', { notation: 'compact' }).format(channel.subscriberCount)} subscribers` : 'Subscriber count unavailable'}</small></div><button className={`secondary-button ${preference?.homePriority ? 'active' : ''}`} onClick={() => updatePref({ homePriority: preference?.homePriority ? 0 : 1 })}><Heart />Local favorite</button></section>}
    <div className="tabs">{[['videos', 'Videos'], ...(shortsEnabled ? [['shorts', 'Shorts']] : []), ...(liveEnabled ? [['live', 'Live']] : [])].map(([key, label]) => <button className={activeTab === key ? 'active' : ''} onClick={() => setTab(key as 'videos' | 'shorts' | 'live')} key={key}>{key === 'live' ? <Radio /> : <UsersRound />}{label}</button>)}</div>
    <div className="channel-preferences"><Settings2 /><label>Playback Rate<select value={preference?.playbackRate ?? ''} onChange={(e) => updatePref({ playbackRate: e.target.value ? Number(e.target.value) : undefined })}><option value="">Global</option>{[0.75, 1, 1.25, 1.5, 1.75, 2].map((r) => <option value={r} key={r}>{r}x</option>)}</select></label><label><input type="checkbox" checked={preference?.hideFromHome ?? false} onChange={(e) => updatePref({ hideFromHome: e.target.checked })} />Homeから隠す</label><label><input type="checkbox" checked={preference?.queueAutoplay ?? true} onChange={(e) => updatePref({ queueAutoplay: e.target.checked })} />Queue連続再生</label></div>
    {loading ? <LoadingCards /> : videos.length ? <div className="video-grid">{videos.map((video) => <VideoCard video={video} key={video.videoId} />)}</div> : <EmptyState icon={UsersRound} title="表示できる動画がありません" description={error || 'このTabに該当する公開動画はありません。'} />}</div>
}
