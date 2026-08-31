import { History, RotateCcw, Trash2 } from 'lucide-react'
import { EmptyState } from '../components/EmptyState'
import { VideoCard } from '../components/VideoCard'
import { useApp } from '../store/AppStore'

export default function HistoryPage() {
  const app = useApp()
  const entries = Object.values(app.state.history).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
  return <div className="page"><div className="page-heading"><div><span className="eyebrow">ACTIVITY</span><h1>History</h1><p>10秒未満の再生はProgress保存対象外です。Completedは再視聴しても維持されます。</p></div>{entries.length > 0 && <button className="danger-button" onClick={() => { if (confirm('すべての履歴を削除しますか？この操作は元に戻せません。')) app.replaceState((current) => ({ ...current, history: {} })) }}><Trash2 />全履歴を削除</button>}</div>
    {entries.length ? <div className="history-groups">{entries.map((progress) => { const video = app.state.videos[progress.videoId]; return video && <div className="history-entry" key={progress.videoId}><VideoCard video={video} compact /><div className="progress-track"><span style={{ width: `${progress.duration ? Math.min(100, progress.position / progress.duration * 100) : 0}%` }} /></div><div className={`watch-state state-${progress.state.toLowerCase()}`}>{progress.state}</div>{progress.state === 'COMPLETED' && <button className="text-button" onClick={() => app.resetProgress(progress.videoId)}><RotateCcw />視聴状態をReset</button>}</div> })}</div> : <EmptyState icon={History} title="履歴はまだありません" description="再生を始めると、進捗と視聴状態がこの端末へ保存されます。" />}
  </div>
}
