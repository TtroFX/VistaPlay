import { Suspense, useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { Outlet, useLocation, useNavigate, useNavigationType } from 'react-router-dom'
import { LoadingCards } from './components/EmptyState'
import { NativeControlLayer } from './components/NativeControlLayer'
import { Sidebar } from './components/Sidebar'
import { ToastViewport } from './components/ToastViewport'
import { TopBar } from './components/TopBar'
import { useEdgeSwipeBack } from './lib/useEdgeSwipeBack'
import { useApp } from './store/AppStore'

export function AppShell() {
  const app = useApp()
  const location = useLocation()
  const navigationType = useNavigationType()
  const navigate = useNavigate()
  const swipeBack = useCallback(() => navigate(-1), [navigate])
  const swipeRef = useEdgeSwipeBack(swipeBack)
  const previousPathname = useRef(location.pathname)

  useEffect(() => {
    const previous = window.history.scrollRestoration
    window.history.scrollRestoration = 'manual'
    return () => { window.history.scrollRestoration = previous }
  }, [])

  useLayoutEffect(() => {
    const previous = previousPathname.current
    previousPathname.current = location.pathname
    if (previous === location.pathname || navigationType === 'POP') return
    const root = document.documentElement
    const priorBehavior = root.style.scrollBehavior
    root.style.scrollBehavior = 'auto'
    window.scrollTo(0, 0)
    root.style.scrollBehavior = priorBehavior
  }, [location.pathname, navigationType])

  useEffect(() => {
    const mode = app.state.settings.theme.mode
    document.documentElement.dataset.theme = mode
    document.documentElement.dataset.surface = app.state.settings.theme.surface
    document.documentElement.style.setProperty('--accent', app.state.settings.theme.accent)
    const hex = app.state.settings.theme.accent.slice(1)
    if (/^[0-9a-fA-F]{6}$/.test(hex)) {
      const [r, g, b] = [0, 2, 4].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255)
      const linear = [r, g, b].map((value) => value <= .03928 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
      const luminance = .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2]
      document.documentElement.style.setProperty('--accent-contrast', luminance > .42 ? '#111512' : '#ffffff')
    }
  }, [app.state.settings.theme])

  if (!app.hydrated) {
    return <div className="app-boot" role="status" aria-live="polite">
      <span className="brand-mark" aria-hidden="true">V</span>
      <span>
        <strong>VistaPlay</strong>
        <small>ローカルデータを復元しています</small>
      </span>
    </div>
  }

  const fullPlayer = location.pathname === '/watch'
  const focusMode = fullPlayer && app.state.settings.layout.focusMode
  const cinemaMode = fullPlayer && app.state.settings.layout.cinemaMode
  const configuredSidebar = app.state.settings.layout.sidebarMode
  const effectiveSidebar = (focusMode || cinemaMode) && configuredSidebar === 'expanded' ? 'compact' : configuredSidebar
  return <div className={`app-shell sidebar-${effectiveSidebar} cards-${app.state.settings.layout.cardSize} ${focusMode ? 'focus-mode' : ''} ${cinemaMode ? 'cinema-mode' : ''}`}>
    <Sidebar />
    <div className="app-column">
      {!focusMode && <TopBar />}
      <main ref={swipeRef} className={`main-content ${fullPlayer ? 'watch-stage' : ''}`}>
        <Suspense fallback={<LoadingCards />}><Outlet /></Suspense>
      </main>
    </div>
    <NativeControlLayer />
    <ToastViewport />
  </div>
}
