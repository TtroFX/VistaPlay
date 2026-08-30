import { Clock3, EyeOff, FolderPlus, GitCompareArrows, Heart, Inbox, ListEnd, MoreHorizontal, Play, Plus, UserRound, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { VideoRef } from '../domain/types'
import { formatDuration } from '../lib/time'
import { useTemporaryHistory } from '../lib/useTemporaryHistory'
import { useApp } from '../store/AppStore'

export function VideoCard({ video, compact = false }: { video: VideoRef; compact?: boolean }) {
  const app = useApp()
  const navigate = useNavigate()
  const [menu, setMenu] = useState(false)
  const [pressing, setPressing] = useState(false)
  const timer = useRef<number>(undefined)
  const longPressed = useRef(false)
  const dismissMenu = useTemporaryHistory(menu, () => setMenu(false), `video-menu:${video.videoId}`)
  const open = () => { if (longPressed.current) { longPressed.current = false; return } app.playVideo(video); navigate(`/watch?v=${video.videoId}`) }
  const onPointerDown = () => { longPressed.current = false; setPressing(true); timer.current = window.setTimeout(() => { longPressed.current = true; setPressing(false); setMenu(true) }, 480) }
  const clear = () => { window.clearTimeout(timer.current); setPressing(false) }
  const action = (handler: () => void) => dismissMenu(handler)
  return <article className={`video-card ${compact ? 'video-card-compact' : ''} ${pressing ? 'long-pressing' : ''}`} onPointerDown={onPointerDown} onPointerUp={clear} onPointerCancel={clear}>
    <button className="thumbnail-button" onClick={open} aria-label={`${video.title}を再生`}>
      <img src={video.thumbnail ?? `https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`} alt="" loading="lazy" />
      <span className="duration-badge">{video.liveStatus === 'live' ? 'LIVE' : formatDuration(video.durationSeconds)}</span>
      <span className="play-reveal"><Play fill="currentColor" /></span>
    </button>
    <div className="video-card-body">
      <button className="title-button" onClick={open}>{video.title}</button>
      <div className="video-meta"><span>{video.channelTitle ?? 'Channel information pending'}</span>{video.viewCount !== undefined && <span>{Intl.NumberFormat('ja', { notation: 'compact' }).format(video.viewCount)}回</span>}</div>
    </div>
    <button className="icon-button card-menu" aria-label="管理メニュー" onClick={() => setMenu(true)}><MoreHorizontal /></button>
    {menu && <div className="card-action-menu" role="menu">
      <button onClick={() => action(() => app.addQueue(video, true))}><ListEnd />次に再生</button>
      <button onClick={() => action(() => app.addQueue(video))}><Plus />Queueへ追加</button>
      <button onClick={() => action(() => app.toggleWatchLater(video))}><Clock3 />後で見る</button>
      <button onClick={() => action(() => app.toggleFavorite(video))}><Heart />お気に入り</button>
      {app.feature('watchInbox') && <button onClick={() => action(() => app.toggleInbox(video))}><Inbox />Inbox</button>}
      <button onClick={() => action(() => navigate(`/library?organize=${video.videoId}`))}><FolderPlus />{app.feature('tags') ? 'Folder / Tags' : 'Folder'}</button>
      <button onClick={() => action(() => app.hideVideo(video.videoId))}><EyeOff />非表示</button>
      {video.channelId && <button onClick={() => action(() => navigate(`/channel/${video.channelId}`))}><UserRound />Channelを開く</button>}
      {app.feature('compare') && <button onClick={() => action(() => navigate(`/compare?a=${video.videoId}`))}><GitCompareArrows />比較に追加</button>}
      <button onClick={() => dismissMenu()}><X />閉じる</button>
    </div>}
  </article>
}
