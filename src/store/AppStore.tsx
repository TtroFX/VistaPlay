import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react'
import { createDefaultState, isFeatureRuntimeEnabled } from '../config/features'
import { loadAppState, saveAppState, saveWatchSession } from '../data/repository'
import type { AIImportHistoryEntry, FeatureKey, PersistedAppState, QueueItem, SavedQueue, ToastMessage, VideoRef, WatchProgress, WatchSession } from '../domain/types'
import { addAIImportHistory } from '../lib/aiBridge'
import { isCompleted, shouldPersistProgress } from '../lib/playerMath'
import { recordDiagnostic } from '../lib/diagnostics'
import { playerEngine, type PlayerSnapshot } from '../player/PlayerEngine'
import { mergeCloudStates, stampSyncMetadata } from '../sync/conflicts'

interface AppContextValue {
  state: PersistedAppState
  hydrated: boolean
  online: boolean
  currentVideo?: VideoRef
  player: PlayerSnapshot
  toasts: ToastMessage[]
  feature: (key: FeatureKey) => boolean
  playVideo: (video: VideoRef, position?: number) => void
  closePlayer: () => void
  addQueue: (video: VideoRef, next?: boolean) => void
  applyRefreshResults: (videos: VideoRef[], additions: QueueItem[]) => void
  removeQueue: (id: string) => void
  reorderQueue: (from: number, to: number) => void
  shuffleQueue: () => void
  playQueueItem: (id: string) => void
  playNext: () => void
  saveQueue: (name: string) => void
  loadSavedQueue: (id: string, mode?: 'replace' | 'append') => void
  deleteSavedQueue: (id: string) => void
  toggleFavorite: (video: VideoRef) => void
  toggleWatchLater: (video: VideoRef) => void
  toggleInbox: (video: VideoRef) => void
  archiveVideo: (videoId: string) => void
  resetProgress: (videoId: string) => void
  hideVideo: (videoId: string) => void
  addFolder: (name: string, parentId?: string) => void
  toggleFolderVideo: (folderId: string, videoId: string) => void
  addTag: (display: string, videoId: string, color?: string) => void
  removeTag: (tagId: string, videoId?: string) => void
  saveNote: (videoId: string, text: string) => void
  setVideoRate: (videoId: string, rate?: number) => void
  patchSettings: (patch: Partial<PersistedAppState['settings']>) => void
  setFeature: (key: FeatureKey, value: boolean) => void
  replaceState: (state: PersistedAppState) => void
  acceptExternalState: (state: PersistedAppState, reconcile?: boolean) => void
  upsertVideos: (videos: VideoRef[]) => void
  addSearchHistory: (query: string) => void
  recordAIImport: (entry: AIImportHistoryEntry, videos?: VideoRef[]) => void
  recordProgress: (videoId: string, position: number, duration: number, watchedDelta?: number) => void
  recordSession: (session: WatchSession) => void
  notify: (message: string, tone?: ToastMessage['tone'], undo?: () => void, duration?: number) => void
  dismissToast: (id: string) => void
}

const AppContext = createContext<AppContextValue | null>(null)

function uniqueQueue(items: QueueItem[]): QueueItem[] {
  const seen = new Set<string>()
  return items.filter((item) => !seen.has(item.video.videoId) && seen.add(item.video.videoId))
}

export function AppProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<PersistedAppState>(() => createDefaultState())
  const [hydrated, setHydrated] = useState(false)
  const [online, setOnline] = useState(navigator.onLine)
  const [currentVideo, setCurrentVideo] = useState<VideoRef>()
  const [player, setPlayer] = useState<PlayerSnapshot>(playerEngine.state)
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const saveTimer = useRef<number>(undefined)

  useEffect(() => {
    loadAppState().then((loaded) => {
      setState(loaded)
      if (loaded.lastPlayer?.videoId && loaded.videos[loaded.lastPlayer.videoId]) setCurrentVideo(loaded.videos[loaded.lastPlayer.videoId])
      setHydrated(true)
    }).catch(() => { recordDiagnostic('migration', 'Local database restore or migration failed'); setHydrated(true) })
  }, [])

  useEffect(() => {
    const onOnline = () => setOnline(true)
    const onOffline = () => setOnline(false)
    window.addEventListener('online', onOnline); window.addEventListener('offline', onOffline)
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline) }
  }, [])

  useEffect(() => {
    const listener = (event: Event) => setPlayer((event as CustomEvent<PlayerSnapshot>).detail)
    playerEngine.addEventListener('change', listener)
    return () => playerEngine.removeEventListener('change', listener)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => { void saveAppState(state) }, 220)
    return () => window.clearTimeout(saveTimer.current)
  }, [state, hydrated])

  const mutate = useCallback((updater: (current: PersistedAppState) => PersistedAppState) => {
    setState((current) => {
      const now = new Date().toISOString()
      const next = updater(current)
      return { ...next, syncMetadata: stampSyncMetadata(current, next, now), revision: current.revision + 1, updatedAt: now }
    })
  }, [])

  const notify = useCallback((message: string, tone: ToastMessage['tone'] = 'default', undo?: () => void, duration = undo ? 5000 : 3200) => {
    const toast = { id: crypto.randomUUID(), message, tone, undo, duration }
    setToasts((items) => [...items, toast])
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== toast.id)), duration)
  }, [])

  const upsertVideos = useCallback((videos: VideoRef[]) => mutate((current) => ({ ...current, videos: { ...current.videos, ...Object.fromEntries(videos.map((video) => [video.videoId, { ...current.videos[video.videoId], ...video }])) } })), [mutate])
  const addSearchHistory = useCallback((query: string) => mutate((current) => ({ ...current, searchHistory: [query, ...current.searchHistory.filter((item) => item !== query)].slice(0, 50) })), [mutate])
  const recordAIImport = useCallback((entry: AIImportHistoryEntry, videos: VideoRef[] = []) => mutate((current) => ({
    ...current,
    videos: { ...current.videos, ...Object.fromEntries(videos.map((video) => [video.videoId, { ...current.videos[video.videoId], ...video }])) },
    aiImportHistory: addAIImportHistory(current.aiImportHistory, entry),
  })), [mutate])

  const playVideo = useCallback((video: VideoRef, position?: number) => {
    setCurrentVideo(video)
    mutate((current) => ({ ...current, videos: { ...current.videos, [video.videoId]: { ...current.videos[video.videoId], ...video } }, lastPlayer: { videoId: video.videoId, position: position ?? current.history[video.videoId]?.position ?? 0, updatedAt: new Date().toISOString() } }))
  }, [mutate])

  const closePlayer = useCallback(() => { playerEngine.stop(); setCurrentVideo(undefined); mutate((current) => ({ ...current, lastPlayer: undefined })) }, [mutate])

  const addQueue = useCallback((video: VideoRef, next = false) => {
    mutate((current) => {
      if (current.queue.some((item) => item.video.videoId === video.videoId)) return current
      const item = { id: crypto.randomUUID(), video, addedAt: new Date().toISOString() }
      return { ...current, videos: { ...current.videos, [video.videoId]: video }, queue: next ? [item, ...current.queue] : [...current.queue, item] }
    })
    notify(next ? '次に再生へ追加しました' : 'Queueへ追加しました', 'success')
  }, [mutate, notify])

  const applyRefreshResults = useCallback((videos: VideoRef[], additions: QueueItem[]) => mutate((current) => ({
    ...current,
    videos: { ...current.videos, ...Object.fromEntries(videos.map((video) => [video.videoId, { ...current.videos[video.videoId], ...video }])) },
    queue: uniqueQueue([...current.queue, ...additions]),
  })), [mutate])

  const removeQueue = useCallback((id: string) => {
    const removed = state.queue.find((item) => item.id === id)
    if (!removed) return
    mutate((current) => ({ ...current, queue: current.queue.filter((item) => item.id !== id) }))
    notify('Queueから削除しました', 'default', () => mutate((current) => ({ ...current, queue: uniqueQueue([...current.queue, removed]) })))
  }, [mutate, notify, state.queue])

  const reorderQueue = useCallback((from: number, to: number) => mutate((current) => {
    const queue = [...current.queue]
    const [item] = queue.splice(from, 1)
    if (item) queue.splice(Math.max(0, Math.min(to, queue.length)), 0, item)
    return { ...current, queue }
  }), [mutate])

  const shuffleQueue = useCallback(() => mutate((current) => {
    const queue = [...current.queue]
    for (let index = queue.length - 1; index > 0; index -= 1) {
      const target = Math.floor(Math.random() * (index + 1))
      ;[queue[index], queue[target]] = [queue[target], queue[index]]
    }
    return { ...current, queue }
  }), [mutate])

  const playQueueItem = useCallback((id: string) => {
    const item = state.queue.find((candidate) => candidate.id === id)
    if (!item) return
    setCurrentVideo(item.video)
    mutate((current) => ({
      ...current,
      videos: { ...current.videos, [item.video.videoId]: item.video },
      queue: current.queue.filter((candidate) => candidate.id !== id),
      lastPlayer: { videoId: item.video.videoId, position: 0, updatedAt: new Date().toISOString() }
    }))
  }, [mutate, state.queue])

  const playNext = useCallback(() => {
    const item = state.queue[0]
    if (!item) return
    mutate((current) => ({ ...current, queue: current.queue.slice(1) }))
    playVideo(item.video, 0)
  }, [mutate, playVideo, state.queue])

  const saveQueue = useCallback((name: string) => mutate((current) => {
    if (!name.trim() || current.savedQueues.length >= 100) return current
    const saved: SavedQueue = { id: crypto.randomUUID(), name: name.trim(), items: structuredClone(current.queue), updatedAt: new Date().toISOString() }
    return { ...current, savedQueues: [...current.savedQueues, saved] }
  }), [mutate])

  const loadSavedQueue = useCallback((id: string, mode: 'replace' | 'append' = 'replace') => mutate((current) => {
    const saved = current.savedQueues.find((item) => item.id === id)
    return saved ? { ...current, queue: uniqueQueue(mode === 'replace' ? structuredClone(saved.items) : [...current.queue, ...structuredClone(saved.items)]) } : current
  }), [mutate])

  const deleteSavedQueue = useCallback((id: string) => mutate((current) => ({ ...current, savedQueues: current.savedQueues.filter((item) => item.id !== id) })), [mutate])

  const toggleList = useCallback((field: 'favorites' | 'watchLater' | 'inbox', video: VideoRef, label: string) => {
    const existed = state[field].includes(video.videoId)
    mutate((current) => ({ ...current, videos: { ...current.videos, [video.videoId]: video }, [field]: existed ? current[field].filter((id) => id !== video.videoId) : [...current[field], video.videoId] }))
    notify(existed ? `${label}から外しました` : `${label}へ追加しました`, existed ? 'default' : 'success', existed ? () => mutate((current) => ({ ...current, [field]: [...current[field], video.videoId] })) : undefined)
  }, [mutate, notify, state])

  const toggleFavorite = useCallback((video: VideoRef) => toggleList('favorites', video, 'お気に入り'), [toggleList])
  const toggleWatchLater = useCallback((video: VideoRef) => toggleList('watchLater', video, '後で見る'), [toggleList])
  const toggleInbox = useCallback((video: VideoRef) => toggleList('inbox', video, 'Inbox'), [toggleList])

  const archiveVideo = useCallback((videoId: string) => {
    const previous = state.history[videoId]
    mutate((current) => ({ ...current, history: { ...current.history, [videoId]: { ...(current.history[videoId] ?? { videoId, position: 0, duration: 0, watchedSeconds: 0 }), state: 'ARCHIVED', updatedAt: new Date().toISOString() } } }))
    notify('Archiveへ移動しました', 'default', () => mutate((current) => {
      const history = { ...current.history }
      if (previous) history[videoId] = { ...previous, updatedAt: new Date().toISOString() }
      else delete history[videoId]
      return { ...current, history }
    }))
  }, [mutate, notify, state.history])
  const resetProgress = useCallback((videoId: string) => {
    mutate((current) => {
      const history = { ...current.history }
      delete history[videoId]
      return { ...current, history, lastPlayer: current.lastPlayer?.videoId === videoId ? { ...current.lastPlayer, position: 0, updatedAt: new Date().toISOString() } : current.lastPlayer }
    })
    notify('視聴状態をResetしました', 'success')
  }, [mutate, notify])
  const hideVideo = useCallback((videoId: string) => {
    if (state.settings.blacklist.videos.includes(videoId)) return
    mutate((current) => ({ ...current, settings: { ...current.settings, blacklist: { ...current.settings.blacklist, videos: [...current.settings.blacklist.videos, videoId] }, updatedAt: new Date().toISOString() } }))
    notify('Home・Search・Recommendationから非表示にしました', 'default', () => mutate((current) => ({ ...current, settings: { ...current.settings, blacklist: { ...current.settings.blacklist, videos: current.settings.blacklist.videos.filter((id) => id !== videoId) }, updatedAt: new Date().toISOString() } })))
  }, [mutate, notify, state.settings.blacklist.videos])
  const addFolder = useCallback((name: string, parentId?: string) => mutate((current) => ({ ...current, folders: name.trim() && (!parentId || !current.folders.find((folder) => folder.id === parentId)?.parentId) ? [...current.folders, { id: crypto.randomUUID(), name: name.trim(), parentId, videoIds: [], pinned: false, updatedAt: new Date().toISOString() }] : current.folders })), [mutate])
  const toggleFolderVideo = useCallback((folderId: string, videoId: string) => mutate((current) => ({ ...current, folders: current.folders.map((folder) => folder.id === folderId ? { ...folder, videoIds: folder.videoIds.includes(videoId) ? folder.videoIds.filter((id) => id !== videoId) : [...folder.videoIds, videoId], updatedAt: new Date().toISOString() } : folder) })), [mutate])
  const addTag = useCallback((display: string, videoId: string, color?: string) => mutate((current) => {
    const trimmed = display.trim().slice(0, 32); if (!trimmed) return current
    const canonical = trimmed.toLocaleLowerCase(); const existing = current.tags.find((tag) => tag.canonical === canonical)
    if (!existing?.videoIds.includes(videoId) && current.tags.filter((tag) => tag.videoIds.includes(videoId)).length >= 20) return current
    if (existing) return { ...current, tags: current.tags.map((tag) => tag.id === existing.id ? { ...tag, videoIds: tag.videoIds.includes(videoId) ? tag.videoIds : [...tag.videoIds, videoId], updatedAt: new Date().toISOString() } : tag) }
    return { ...current, tags: [...current.tags, { id: crypto.randomUUID(), canonical, display: trimmed, color, videoIds: [videoId], updatedAt: new Date().toISOString() }] }
  }), [mutate])
  const removeTag = useCallback((tagId: string, videoId?: string) => {
    const previous = state.tags.find((tag) => tag.id === tagId)
    if (!previous || (videoId && !previous.videoIds.includes(videoId))) return
    mutate((current) => ({ ...current, tags: videoId ? current.tags.map((tag) => tag.id === tagId ? { ...tag, videoIds: tag.videoIds.filter((id) => id !== videoId), updatedAt: new Date().toISOString() } : tag) : current.tags.filter((tag) => tag.id !== tagId) }))
    notify(videoId ? 'Tagを動画から外しました' : 'Tagを削除しました', 'default', () => mutate((current) => ({
      ...current,
      tags: videoId
        ? current.tags.map((tag) => tag.id === tagId ? { ...tag, videoIds: tag.videoIds.includes(videoId) ? tag.videoIds : [...tag.videoIds, videoId], updatedAt: new Date().toISOString() } : tag)
        : current.tags.some((tag) => tag.id === tagId) ? current.tags : [...current.tags, { ...previous, updatedAt: new Date().toISOString() }]
    })))
  }, [mutate, notify, state.tags])
  const saveNote = useCallback((videoId: string, text: string) => mutate((current) => ({ ...current, notes: [...current.notes.filter((note) => note.videoId !== videoId), { videoId, text: text.slice(0, 20000), updatedAt: new Date().toISOString() }] })), [mutate])
  const setVideoRate = useCallback((videoId: string, rate?: number) => mutate((current) => ({ ...current, videoPreferences: [...current.videoPreferences.filter((item) => item.videoId !== videoId), ...(rate ? [{ videoId, playbackRate: rate, updatedAt: new Date().toISOString() }] : [])] })), [mutate])

  const patchSettings = useCallback((patch: Partial<PersistedAppState['settings']>) => mutate((current) => ({ ...current, settings: { ...current.settings, ...patch, updatedAt: new Date().toISOString() } })), [mutate])
  const setFeature = useCallback((key: FeatureKey, value: boolean) => mutate((current) => ({ ...current, settings: { ...current.settings, features: { ...current.settings.features, [key]: value }, updatedAt: new Date().toISOString() } })), [mutate])

  const recordProgress = useCallback((videoId: string, position: number, duration: number, watchedDelta = 0) => mutate((current) => {
    const previous = current.history[videoId]
    const watchedSeconds = (previous?.watchedSeconds ?? 0) + Math.max(0, watchedDelta)
    if (!shouldPersistProgress(Boolean(previous), watchedSeconds)) return { ...current, lastPlayer: { videoId, position, updatedAt: new Date().toISOString() } }
    const completed = previous?.state === 'COMPLETED' || isCompleted(position, duration, watchedSeconds)
    const progress: WatchProgress = { videoId, position: completed ? 0 : position, duration, watchedSeconds, state: completed ? 'COMPLETED' : watchedSeconds >= 10 ? 'WATCHING' : previous?.state ?? 'UNWATCHED', updatedAt: new Date().toISOString() }
    return { ...current, history: { ...current.history, [videoId]: progress }, inbox: watchedSeconds >= 30 ? current.inbox.filter((id) => id !== videoId) : current.inbox, lastPlayer: { videoId, position: progress.position, updatedAt: progress.updatedAt } }
  }), [mutate])

  const recordSession = useCallback((session: WatchSession) => { void saveWatchSession(session) }, [])
  // UI-level aggregate edits still need the same revision and conflict clocks as
  // the focused store actions above. Only trusted restore/sync boundaries may
  // install an already-versioned state without creating another local edit.
  const replaceState = useCallback((next: PersistedAppState) => mutate(() => next), [mutate])
  const acceptExternalState = useCallback((next: PersistedAppState, reconcile = false) => setState((current) => reconcile ? mergeCloudStates(current, next) : next), [])
  const feature = useCallback((key: FeatureKey) => isFeatureRuntimeEnabled(state.settings.features, key), [state.settings.features])

  const value = useMemo<AppContextValue>(() => ({
    state, hydrated, online, currentVideo, player, toasts, feature, playVideo, closePlayer, addQueue, applyRefreshResults, removeQueue, reorderQueue, shuffleQueue, playQueueItem, playNext,
    saveQueue, loadSavedQueue, deleteSavedQueue, toggleFavorite, toggleWatchLater, toggleInbox, archiveVideo, resetProgress, hideVideo, addFolder, toggleFolderVideo,
    addTag, removeTag, saveNote, setVideoRate, patchSettings, setFeature, replaceState, acceptExternalState, upsertVideos, recordAIImport, recordProgress, recordSession, notify,
    addSearchHistory, dismissToast: (id) => setToasts((items) => items.filter((item) => item.id !== id))
  }), [state, hydrated, online, currentVideo, player, toasts, feature, playVideo, closePlayer, addQueue, applyRefreshResults, removeQueue, reorderQueue, shuffleQueue, playQueueItem, playNext, saveQueue, loadSavedQueue, deleteSavedQueue, toggleFavorite, toggleWatchLater, toggleInbox, archiveVideo, resetProgress, hideVideo, addFolder, toggleFolderVideo, addTag, removeTag, saveNote, setVideoRate, patchSettings, setFeature, replaceState, acceptExternalState, upsertVideos, addSearchHistory, recordAIImport, recordProgress, recordSession, notify])

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppContextValue {
  const value = useContext(AppContext)
  if (!value) throw new Error('useApp must be used within AppProvider')
  return value
}
