import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description: string; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-icon"><Icon /></div><h2>{title}</h2><p>{description}</p>{action}</div>
}

export function LoadingCards() {
  return <div className="video-grid" aria-label="読み込み中">{Array.from({ length: 6 }, (_, i) => <div className="skeleton-card" key={i}><div className="skeleton thumbnail-skeleton" /><div className="skeleton line wide" /><div className="skeleton line" /></div>)}</div>
}
