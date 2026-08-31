import { Search, UsersRound } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState'
import { useApp } from '../store/AppStore'

export default function ChannelsPage() {
  const app = useApp(); const navigate = useNavigate()
  const channels = [...new Map(Object.values(app.state.videos).filter((v) => v.channelId).map((v) => [v.channelId!, { id: v.channelId!, title: v.channelTitle ?? 'Channel', count: Object.values(app.state.videos).filter((x) => x.channelId === v.channelId).length }])).values()]
  return <div className="page"><div className="page-heading"><div><span className="eyebrow">SOURCES</span><h1>Channels</h1><p>Libraryと視聴履歴から、利用したChannelをまとめます。</p></div><button className="primary-button" onClick={() => navigate('/search')}><Search />Channelを検索</button></div>{channels.length ? <div className="channel-grid">{channels.map((channel) => <button className="channel-card" key={channel.id} onClick={() => navigate(`/channel/${channel.id}`)}><span className="channel-avatar"><UsersRound /></span><strong>{channel.title}</strong><small>Local Library {channel.count}本</small></button>)}</div> : <EmptyState icon={UsersRound} title="Channelはまだありません" description="動画を開くとChannelがLocal Libraryへ追加されます。" />}</div>
}
