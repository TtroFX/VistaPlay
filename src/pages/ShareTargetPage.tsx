import { Inbox, ListVideo, Play, Share2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { VideoRef } from '../domain/types'
import { parseYouTubeInput, verifyVideoIds } from '../lib/youtube'
import { useApp } from '../store/AppStore'

export default function ShareTargetPage() {
  const app = useApp()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const shared = params.get('url') || params.get('text') || ''
  const parsed = parseYouTubeInput(shared)
  const existing = parsed?.type === 'video' ? app.state.videos[parsed.id] : undefined
  const [video, setVideo] = useState<VideoRef | undefined>(() => parsed?.type === 'video' ? existing ?? fallbackVideo(parsed.id) : undefined)
  const [verifying, setVerifying] = useState(parsed?.type === 'video')
  const saved = video ? app.state.inbox.includes(video.videoId) : false

  useEffect(() => {
    if (parsed?.type !== 'video') return
    const controller = new AbortController()
    let active = true
    setVerifying(true)
    verifyVideoIds([parsed.id], controller.signal).then(({ valid, invalid }) => {
      if (!active) return
      if (valid[0]) { setVideo(valid[0]); app.upsertVideos(valid) }
      else if (invalid.includes(parsed.id)) setVideo((current) => ({ ...(current ?? fallbackVideo(parsed.id)), available: false, unavailableReason: 'unknown' }))
    }).catch(() => { /* Direct embedded playback remains available without metadata capability. */ }).finally(() => { if (active) setVerifying(false) })
    return () => { active = false; controller.abort() }
  }, [parsed?.id, parsed?.type])

  function watch() {
    if (!video) return
    app.playVideo(video)
    navigate(`/watch?v=${video.videoId}`, { replace: true })
  }

  function saveInbox() {
    if (!video || saved) return
    app.toggleInbox(video)
  }

  if (parsed?.type === 'channel' || parsed?.type === 'playlist') {
    const label = parsed.type === 'channel' ? 'Channel' : 'Playlist'
    return <div className="page share-target-page"><div className="share-preview"><Share2 /><span className="eyebrow">SHARED TO VISTAPLAY</span><h1>{label} link</h1><p>共有された{label}を公式YouTube metadata導線で開きます。</p><button className="primary-button" onClick={() => navigate(`/${parsed.type}/${parsed.id}`, { replace: true })}><ListVideo />{label}を開く</button></div></div>
  }

  if (!video) return <div className="page share-target-page"><div className="capability-notice"><Share2 /><div><strong>対応するYouTube URLを確認できませんでした</strong><p>Video、Channel、PlaylistのURLを共有してください。</p></div></div><button className="secondary-button" onClick={() => navigate('/search', { replace: true })}>Searchへ移動</button></div>

  return <div className="page share-target-page"><div className="share-preview"><Share2 /><span className="eyebrow">SHARED TO VISTAPLAY</span><div className="share-video"><img src={video.thumbnail} alt="" /><div><h1>{video.title}</h1><p>{video.channelTitle ?? (verifying ? 'Metadataを確認中…' : 'YouTube video')}</p>{video.available === false && <span className="error-copy">この動画は現在利用できない可能性があります。</span>}</div></div><div className="heading-actions"><button className="primary-button" onClick={watch}><Play />Watch Preview</button>{app.feature('watchInbox') && <button className="secondary-button" onClick={saveInbox} disabled={saved}><Inbox />{saved ? 'Inbox保存済み' : 'Inboxへ保存'}</button>}</div><button className="text-button" onClick={() => navigate('/', { replace: true })}>今は開かない</button></div></div>
}

function fallbackVideo(videoId: string): VideoRef {
  return { videoId, title: `Video ${videoId}`, thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`, available: true }
}
