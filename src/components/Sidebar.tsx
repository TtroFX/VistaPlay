import { Compass, History, Home, Inbox, Library, ListVideo, Menu, PanelLeftClose, Search, Settings, SlidersHorizontal, UsersRound } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useApp } from '../store/AppStore'

const items = {
  home: { label: 'Home', path: '/', icon: Home, core: true },
  search: { label: 'Search', path: '/search', icon: Search, core: true },
  channels: { label: 'Channels', path: '/channels', icon: UsersRound },
  library: { label: 'Library', path: '/library', icon: Library, core: true },
  queue: { label: 'Queue', path: '/queue', icon: ListVideo },
  history: { label: 'History', path: '/history', icon: History },
  inbox: { label: 'Watch Inbox', path: '/inbox', icon: Inbox, feature: 'watchInbox' as const },
  settings: { label: 'Settings', path: '/settings', icon: Settings, core: true }
}

export function Sidebar() {
  const { state, patchSettings, feature } = useApp()
  const mode = state.settings.layout.sidebarMode
  const setMode = (next: 'expanded' | 'compact' | 'hidden') => patchSettings({ layout: { ...state.settings.layout, sidebarMode: next } })
  if (mode === 'hidden') return <button className="sidebar-reveal icon-button" aria-label="Sidebarを表示" onClick={() => setMode('compact')}><Menu /></button>
  return <aside className={`sidebar sidebar-${mode}`}>
    <div className="brand-row"><span className="brand-mark">V</span><strong>VistaPlay</strong><button className="icon-button" aria-label="Sidebarを縮小" onClick={() => setMode(mode === 'expanded' ? 'compact' : 'hidden')}><PanelLeftClose /></button></div>
    <nav aria-label="メインナビゲーション">
      {state.settings.layout.sidebarOrder.map((key) => {
        const item = items[key as keyof typeof items]
        if (!item || state.settings.layout.sidebarHidden.includes(key) || ('feature' in item && item.feature && !feature(item.feature))) return null
        const Icon = item.icon
        return <NavLink key={key} to={item.path} end={item.path === '/'} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title={mode === 'compact' ? item.label : undefined}><Icon /><span>{item.label}</span></NavLink>
      })}
    </nav>
    <div className="sidebar-spacer" />
    {feature('customRecommendation') && <NavLink to="/discover" className="nav-item"><Compass /><span>Discover</span></NavLink>}
    <NavLink to="/settings/features" className="nav-item"><SlidersHorizontal /><span>Features</span></NavLink>
    <button className="nav-item sidebar-expand" onClick={() => setMode('expanded')}><Menu /><span>Expand</span></button>
  </aside>
}
