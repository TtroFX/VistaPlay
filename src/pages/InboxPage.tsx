import { Inbox } from 'lucide-react'
import { EmptyState } from '../components/EmptyState'
import { VideoCard } from '../components/VideoCard'
import { useApp } from '../store/AppStore'

export default function InboxPage() {
  const app = useApp(); const videos = app.state.inbox.map((id) => app.state.videos[id]).filter(Boolean)
  return <div className="page"><div className="page-heading"><div><span className="eyebrow">CAPTURE FIRST</span><h1>Watch Inbox</h1><p>未整理の受信箱です。30秒以上再生すると通常のWatchingへ移動します。</p></div></div>{videos.length ? <div className="video-grid">{videos.map((video) => <VideoCard key={video.videoId} video={video} />)}</div> : <EmptyState icon={Inbox} title="Inboxは空です" description="他Appから共有するか、Video Cardを長押ししてInboxへ追加してください。" />}</div>
}
