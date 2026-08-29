export type FeatureKey =
  | 'advancedSearch' | 'customRecommendation' | 'shorts' | 'live'
  | 'chapters' | 'comments' | 'captions' | 'abRepeat' | 'temporaryBoost' | 'pip'
  | 'watchInbox' | 'smartFolders' | 'tags' | 'savedQueue'
  | 'sponsorSegments' | 'compare' | 'statistics' | 'chatgpt'
  | 'liveChat' | 'dvr' | 'upcoming' | 'aiPromptBuilder' | 'aiImport' | 'aiSmartSearch'

export type WatchState = 'UNWATCHED' | 'WATCHING' | 'COMPLETED' | 'ARCHIVED'
export type ThemeMode = 'light' | 'dark' | 'system'
export type SurfaceTone = 'neutral' | 'warm' | 'cool'

export interface VideoRef {
  videoId: string
  title: string
  channelId?: string
  channelTitle?: string
  description?: string
  thumbnail?: string
  durationSeconds?: number
  publishedAt?: string
  viewCount?: number
  categoryId?: string
  tags?: string[]
  liveStatus?: 'none' | 'live' | 'upcoming' | 'ended'
  available?: boolean
  unavailableReason?: 'deleted' | 'private' | 'region' | 'unknown'
}

export interface QueueItem { id: string; video: VideoRef; addedAt: string }
export interface SavedQueue { id: string; name: string; items: QueueItem[]; updatedAt: string }
export interface WatchProgress { videoId: string; position: number; duration: number; watchedSeconds: number; state: WatchState; updatedAt: string }
export interface WatchSession {
  sessionId: string
  videoId: string
  channelId?: string
  startedAt: string
  endedAt: string
  watchedMediaSeconds: number
  realElapsedSeconds: number
  playbackRates: Array<{ rate: number; realSeconds: number }>
  seekEvents: Array<{ from: number; to: number; at: string }>
  completionRate: number
}
export interface Folder { id: string; name: string; parentId?: string; videoIds: string[]; pinned: boolean; updatedAt: string }
export interface Tag { id: string; canonical: string; display: string; color?: string; videoIds: string[]; updatedAt: string }
export type SmartOperator = 'and' | 'or'
export interface SmartCondition { field: 'channel' | 'category' | 'tag' | 'duration' | 'watchState' | 'favorite' | 'addedDate' | 'publishedDate'; op: 'eq' | 'contains' | 'lt' | 'gt'; value: string | number | boolean }
export interface SmartFolder { id: string; name: string; operator: SmartOperator; conditions: SmartCondition[]; updatedAt: string }
export interface Note { videoId: string; text: string; updatedAt: string }
export interface ChannelPreference { channelId: string; playbackRate?: number; homePriority: number; hideFromHome: boolean; shorts: 'default' | 'prefer' | 'avoid'; queueAutoplay: boolean; updatedAt: string }
export interface VideoPreference { videoId: string; playbackRate?: number; updatedAt: string }
export interface AutoAddRule {
  id: string
  name: string
  enabled: boolean
  channelId?: string
  includeKeyword?: string
  excludeKeyword?: string
  categoryId?: string
  maxDuration?: number
  live?: boolean
  shorts?: boolean
  publishedWithinDays?: number
  updatedAt: string
}
export interface Recommendation { video: VideoRef; reason: string; priority: number; source: 'local' | 'chatgpt' }
export interface SearchFilters { type: 'video' | 'channel' | 'playlist'; publishedAfter?: string; duration: 'any' | 'short' | 'medium' | 'long'; live: 'any' | 'live' | 'upcoming'; excludeChannels: string[]; excludeKeywords: string[]; shorts: 'include' | 'exclude' | 'only'; whitelistOnly: boolean }
export interface SearchResult { type: 'video' | 'channel' | 'playlist'; id: string; title: string; description?: string; thumbnail?: string; channelTitle?: string; video?: VideoRef }
export interface ThemeSettings { mode: ThemeMode; surface: SurfaceTone; accent: string }
export interface LayoutSettings { sidebarMode: 'expanded' | 'compact' | 'hidden'; sidebarOrder: string[]; sidebarHidden: string[]; cardSize: 'compact' | 'comfortable' | 'large'; rightPaneWidth: number; defaultWatchTab: string; focusMode: boolean; cinemaMode: boolean }
export interface PlaybackSettings { globalRate: number; speedPresets: number[]; seekSeconds: 5 | 10 | 15 | 30; boostMode: 'next' | 'maximum'; continuousPlay: boolean }
export interface AppSettings { theme: ThemeSettings; layout: LayoutSettings; playback: PlaybackSettings; features: Record<FeatureKey, boolean>; homeOrder: string[]; homeHidden: string[]; cacheLimitMb: 100 | 250 | 500; cloudSync: boolean; blacklist: { videos: string[]; channels: string[]; keywords: string[] }; whitelistChannels: string[]; whitelistOnly: boolean; updatedAt: string }

export interface PersistedAppState {
  settings: AppSettings
  videos: Record<string, VideoRef>
  queue: QueueItem[]
  savedQueues: SavedQueue[]
  favorites: string[]
  watchLater: string[]
  inbox: string[]
  history: Record<string, WatchProgress>
  folders: Folder[]
  tags: Tag[]
  smartFolders: SmartFolder[]
  notes: Note[]
  channelPreferences: ChannelPreference[]
  videoPreferences: VideoPreference[]
  autoAddRules: AutoAddRule[]
  searchHistory: string[]
  aiImportHistory: Array<{ id: string; query: string; videoIds: string[]; createdAt: string }>
  lastPlayer?: { videoId: string; position: number; queueItemId?: string; updatedAt: string }
  revision: number
  updatedAt: string
}

export interface ToastMessage { id: string; message: string; tone?: 'default' | 'success' | 'error'; undo?: () => void; duration?: number }
