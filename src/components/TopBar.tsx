import { ArrowLeft, Cloud, CloudOff, Command, Search } from 'lucide-react'
import { FormEvent, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { parseYouTubeInput } from '../lib/youtube'
import { useApp } from '../store/AppStore'

export function TopBar() {
  const navigate = useNavigate()
  const location = useLocation()
  const { online, notify } = useApp()
  const [query, setQuery] = useState('')
  const submit = (event: FormEvent) => {
    event.preventDefault(); const parsed = parseYouTubeInput(query)
    if (parsed?.type === 'video') navigate(`/watch?v=${parsed.id}`)
    else if (parsed?.type === 'channel') navigate(`/channel/${parsed.id}`)
    else if (parsed?.type === 'playlist') navigate(`/playlist/${parsed.id}`)
    else if (query.trim()) navigate(`/search?q=${encodeURIComponent(query.trim())}`)
    else notify('検索語またはYouTube URLを入力してください')
  }
  return <header className="topbar">
    <button className="icon-button" aria-label="戻る" onClick={() => navigate(-1)} disabled={location.key === 'default'}><ArrowLeft /></button>
    <form className="command-search" onSubmit={submit}>
      <Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="動画・Channel・Playlistを検索、またはURLを貼り付け" aria-label="全体検索" />
      <span className="command-hint"><Command size={14} /> K</span>
    </form>
    <div className={`network-pill ${online ? 'online' : 'offline'}`}>{online ? <Cloud /> : <CloudOff />}<span>{online ? 'Online' : 'Offline'}</span></div>
  </header>
}
