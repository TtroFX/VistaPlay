import { lazy, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AppShell } from './AppShell'
import { ErrorBoundary } from './components/ErrorBoundary'
import { UpdatePrompt } from './components/UpdatePrompt'
import type { FeatureKey } from './domain/types'
import { AppProvider, useApp } from './store/AppStore'
import './styles.css'

const HomePage = lazy(() => import('./pages/HomePage'))
const SearchPage = lazy(() => import('./pages/SearchPage'))
const WatchPage = lazy(() => import('./pages/WatchPage'))
const QueuePage = lazy(() => import('./pages/QueuePage'))
const LibraryPage = lazy(() => import('./pages/LibraryPage'))
const HistoryPage = lazy(() => import('./pages/HistoryPage'))
const InboxPage = lazy(() => import('./pages/InboxPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const ChannelsPage = lazy(() => import('./pages/ChannelsPage'))
const ChannelPage = lazy(() => import('./pages/ChannelPage'))
const PlaylistPage = lazy(() => import('./pages/PlaylistPage'))
const ComparePage = lazy(() => import('./pages/ComparePage'))
const AIPage = lazy(() => import('./pages/AIPage'))
const StatisticsPage = lazy(() => import('./pages/StatisticsPage'))
const DiscoverPage = lazy(() => import('./pages/DiscoverPage'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))

function FeatureGuard({ feature, children }: { feature: FeatureKey; children: ReactNode }) {
  const app = useApp()
  return app.feature(feature) ? children : <NotFoundPage />
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <BrowserRouter>
      <AppProvider>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<HomePage />} />
            <Route path="search" element={<SearchPage />} />
            <Route path="watch" element={<WatchPage />} />
            <Route path="queue" element={<QueuePage />} />
            <Route path="library" element={<LibraryPage />} />
            <Route path="history" element={<HistoryPage />} />
            <Route path="inbox" element={<FeatureGuard feature="watchInbox"><InboxPage /></FeatureGuard>} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="settings/features" element={<SettingsPage />} />
            <Route path="settings/connections" element={<SettingsPage />} />
            <Route path="channels" element={<ChannelsPage />} />
            <Route path="channel/:id" element={<ChannelPage />} />
            <Route path="playlist/:id" element={<PlaylistPage />} />
            <Route path="compare" element={<FeatureGuard feature="compare"><ComparePage /></FeatureGuard>} />
            <Route path="ai" element={<FeatureGuard feature="chatgpt"><AIPage /></FeatureGuard>} />
            <Route path="statistics" element={<FeatureGuard feature="statistics"><StatisticsPage /></FeatureGuard>} />
            <Route path="discover" element={<DiscoverPage />} />
            <Route path="share-target" element={<HomePage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
        <UpdatePrompt />
      </AppProvider>
    </BrowserRouter>
  </ErrorBoundary>,
)
