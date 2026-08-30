import { ListPlus, Play, UserRound } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { EmptyState, LoadingCards } from '../components/EmptyState'
import { VideoCard } from '../components/VideoCard'
import type { VideoRef } from '../domain/types'
import { fetchPlaylist, type PlaylistDetails } from '../lib/youtube'
import { useApp } from '../store/AppStore'

export default function PlaylistPage() {
  const { id = '' } = useParams()
  const app = useApp()
  const [playlist, setPlaylist] = useState<PlaylistDetails>()
  const [videos, setVideos] = useState<VideoRef[]>([])
  const [next, setNext] = useState<string>()
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const request = useRef<AbortController | undefined>(undefined)
  const generation = useRef(0)

  useEffect(() => {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    const currentGeneration = ++generation.current
    setPlaylist(undefined); setVideos([]); setNext(undefined); setLoading(true); setLoadingMore(false); setError('')
    fetchPlaylist(id, undefined, controller.signal).then((result) => {
      if (generation.current !== currentGeneration) return
      setPlaylist(result.playlist); setVideos(result.items); setNext(result.nextPageToken); app.upsertVideos(result.items)
    }).catch((reason) => {
      if (!controller.signal.aborted && generation.current === currentGeneration) setError(reason instanceof Error ? reason.message : 'Playlist unavailable')
    }).finally(() => { if (generation.current === currentGeneration) setLoading(false) })
    return () => controller.abort()
  }, [id])

  async function loadMore() {
    if (!next || loadingMore) return
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    const currentGeneration = ++generation.current
    setLoadingMore(true); setError('')
    try {
      const result = await fetchPlaylist(id, next, controller.signal)
      if (generation.current !== currentGeneration) return
      const combined = [...new Map([...videos, ...result.items].map((video) => [video.videoId, video])).values()]
      setPlaylist(result.playlist); setVideos(combined); setNext(result.nextPageToken); app.upsertVideos(result.items)
    } catch (reason) {
      if (!controller.signal.aborted && generation.current === currentGeneration) setError(reason instanceof Error ? reason.message : 'Playlistを追加取得できませんでした')
    } finally { if (generation.current === currentGeneration) setLoadingMore(false) }
  }

  return <div className="page playlist-page">
    <div className="page-heading"><div><span className="eyebrow">PLAYLIST</span><h1>{playlist?.title ?? 'Playlist'}</h1><p>{playlist?.description || 'Defaultはread-onlyです。Queueとは別に扱います。'}</p>{playlist && <div className="playlist-meta">{playlist.channelId ? <Link to={`/channel/${playlist.channelId}`}><UserRound />{playlist.channelTitle ?? 'Channel'}</Link> : playlist.channelTitle && <span><UserRound />{playlist.channelTitle}</span>}<span>{playlist.itemCount !== undefined ? `${playlist.itemCount} videos` : `${videos.length} loaded`}</span></div>}</div><button className="primary-button" disabled={!videos.length} onClick={() => videos.forEach((video) => app.addQueue(video))}><ListPlus />読み込み済みをQueueへ</button></div>
    {loading ? <LoadingCards /> : videos.length ? <><div className="video-grid">{videos.map((video) => <VideoCard video={video} key={video.videoId} />)}</div>{next && <button className="secondary-button load-more" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? '読み込み中…' : 'さらに表示'}</button>}{error && <div className="capability-notice"><ListPlus /><div><strong>追加取得に失敗しました</strong><p>{error}</p></div></div>}</> : <EmptyState icon={Play} title="Playlistを読み込めません" description={error || '公開動画がありません。'} />}
  </div>
}
