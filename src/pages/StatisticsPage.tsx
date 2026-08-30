import { BarChart3, Clock3, Gauge, PlayCircle, TimerReset, TrendingUp } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { loadWatchSessions } from '../data/repository'
import type { WatchSession } from '../domain/types'
import { calculateStatistics } from '../lib/statistics'
import { formatCompactSeconds } from '../lib/time'
import { useApp } from '../store/AppStore'

export default function StatisticsPage() {
  const app = useApp(); const [sessions, setSessions] = useState<WatchSession[]>([])
  useEffect(() => { void loadWatchSessions().then(setSessions) }, [])
  const stats = useMemo(() => calculateStatistics(
    sessions,
    Object.fromEntries(Object.values(app.state.videos).map((video) => [video.videoId, video.durationSeconds ?? 0])),
    Object.fromEntries(Object.values(app.state.videos).filter((video) => video.categoryId).map((video) => [video.videoId, video.categoryId!]))
  ), [sessions, app.state.videos])
  const topChannels = Object.entries(stats.channelSeconds).sort((a, b) => b[1] - a[1]).slice(0, 8)
  const topCategories = Object.entries(stats.categorySeconds).sort((a, b) => b[1] - a[1]).slice(0, 8)
  const maxHeat = Math.max(1, ...Object.values(stats.heatmap))
  return <div className="page statistics-page"><div className="page-heading"><div><span className="eyebrow">ACTUAL PLAYING TIME</span><h1>Statistics</h1><p>PauseとSeek Jumpを除外したWatchSessionから計算します。</p></div></div><div className="stat-grid"><Stat icon={Clock3} label="Watch Time" value={formatCompactSeconds(stats.realWatchSeconds)} /><Stat icon={PlayCircle} label="Video Count" value={String(stats.watchedVideoCount)} /><Stat icon={Gauge} label="Average Rate" value={`${stats.averagePlaybackRate ? stats.averagePlaybackRate.toFixed(2) : '–'}x`} /><Stat icon={TimerReset} label="Time Saved" value={formatCompactSeconds(stats.timeSavedSeconds)} /></div><div className="analytics-grid"><section className="analytics-card"><div className="section-heading"><div><span className="section-kicker"><TrendingUp /></span><h2>Channel Statistics</h2></div></div>{topChannels.length ? <div className="bar-list">{topChannels.map(([channelId, seconds]) => { const channel = Object.values(app.state.videos).find((v) => v.channelId === channelId)?.channelTitle ?? channelId; return <div key={channelId}><span>{channel}</span><div><i style={{ width: `${seconds / topChannels[0][1] * 100}%` }} /></div><strong>{formatCompactSeconds(seconds)}</strong></div> })}</div> : <p className="pane-empty">視聴Sessionがまだありません。</p>}</section><section className="analytics-card"><div className="section-heading"><div><span className="section-kicker"><BarChart3 /></span><h2>Category Statistics</h2></div></div>{topCategories.length ? <div className="bar-list">{topCategories.map(([categoryId, seconds]) => <div key={categoryId}><span>Category {categoryId}</span><div><i style={{ width: `${seconds / topCategories[0][1] * 100}%` }} /></div><strong>{formatCompactSeconds(seconds)}</strong></div>)}</div> : <p className="pane-empty">Category metadataのある視聴Sessionがまだありません。</p>}</section><section className="analytics-card heatmap-card"><div className="section-heading"><div><span className="section-kicker"><BarChart3 /></span><h2>30-minute Heatmap</h2></div></div><div className="heatmap">{Array.from({ length: 48 }, (_, index) => { const key = `${String(Math.floor(index / 2)).padStart(2, '0')}:${index % 2 ? '30' : '00'}`; const value = stats.heatmap[key] ?? 0; return <div key={key} title={`${key} — ${formatCompactSeconds(value)}`} style={{ '--heat': value / maxHeat } as React.CSSProperties}><span>{index % 4 === 0 ? key : ''}</span></div> })}</div></section></div></div>
}

function Stat({ icon: Icon, label, value }: { icon: typeof Clock3; label: string; value: string }) { return <article className="stat-card"><span><Icon /></span><div><small>{label}</small><strong>{value}</strong></div></article> }
