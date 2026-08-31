import { RotateCcw, X } from 'lucide-react'
import { useApp } from '../store/AppStore'

export function ToastViewport() {
  const { toasts, dismissToast } = useApp()
  return <div className="toast-viewport" aria-live="polite">
    {toasts.map((toast) => <div className={`toast toast-${toast.tone ?? 'default'}`} key={toast.id}>
      <span>{toast.message}</span>
      {toast.undo && <button className="toast-action" onClick={() => { toast.undo?.(); dismissToast(toast.id) }}><RotateCcw size={16} />元に戻す</button>}
      <button className="icon-button compact" aria-label="通知を閉じる" onClick={() => dismissToast(toast.id)}><X size={16} /></button>
    </div>)}
  </div>
}
