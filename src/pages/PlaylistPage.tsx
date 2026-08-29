import { ListPlus, Play } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { EmptyState, LoadingCards } from '../components/EmptyState'
import { VideoCard } from '../components/VideoCard'
import type { VideoRef } from '../domain/types'
import { fetchPlaylist } from '../lib/youtube'
import { useApp } from '../store/AppStore'

export default function PlaylistPage() {
  const { id = '' } = useParams(); const app = useApp(); const [videos, setVideos] = useState<VideoRef[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState('')
  useEffect(() => { const controller = new AbortController(); fetchPlaylist(id, undefined, controller.signal).then((result) => { setVideos(result.items); app.upsertVideos(result.items) }).catch((e) => setError(e instanceof Error ? e.message : 'Playlist unavailable')).finally(() => setLoading(false)); return () => controller.abort() }, [id])
  return <div className="page"><div className="page-heading"><div><span className="eyebrow">PLAYLIST</span><h1>Playlist</h1><p>Defaultはread-onlyです。Queueとは別に扱います。</p></div><button className="primary-button" disabled={!videos.length} onClick={() => videos.forEach((v) => app.addQueue(v))}><ListPlus />全件をQueueへ</button></div>{loading ? <LoadingCards /> : videos.length ? <div className="video-grid">{videos.map((v) => <VideoCard video={v} key={v.videoId} />)}</div> : <EmptyState icon={Play} title="Playlistを読み込めません" description={error || '公開動画がありません。'} />}</div>
}
