import { Download, X } from 'lucide-react'
import { useRegisterSW } from 'virtual:pwa-register/react'

export function UpdatePrompt() {
  const { needRefresh: [needRefresh, setNeedRefresh], updateServiceWorker } = useRegisterSW()
  if (!needRefresh) return null
  return <div className="update-prompt" role="status"><Download /><span><strong>アップデートがあります</strong><small>再生中でも強制Reloadしません。</small></span><button onClick={() => void updateServiceWorker(true)}>適用</button><button className="icon-button" onClick={() => setNeedRefresh(false)}><X /></button></div>
}
