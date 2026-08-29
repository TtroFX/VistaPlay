import { Compass } from 'lucide-react'
import { EmptyState } from '../components/EmptyState'
import { VideoCard } from '../components/VideoCard'
import { rankLocalRecommendations } from '../lib/localRecommendations'
import { applyVisibilityRules } from '../lib/videoRules'
import { useApp } from '../store/AppStore'

export default function DiscoverPage() { const app = useApp(); const items = rankLocalRecommendations(applyVisibilityRules(Object.values(app.state.videos), app.state.settings), app.state); return <div className="page"><div className="page-heading"><div><span className="eyebrow">LOCAL RANKING</span><h1>Discover</h1><p>YouTube内部Recommendationは再現せず、Local Libraryを透明な規則でrankします。</p></div></div>{items.length ? <div className="video-grid">{items.map((item) => <div className="recommendation-card" key={item.video.videoId}><VideoCard video={item.video} /><p>{item.reason}</p></div>)}</div> : <EmptyState icon={Compass} title="推薦候補がまだありません" description="Libraryへ動画が増えると、未視聴・新しさ・Channel affinityから候補を作ります。" />}</div> }
