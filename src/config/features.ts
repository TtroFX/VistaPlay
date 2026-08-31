import type { AppSettings, FeatureKey, PersistedAppState } from '../domain/types'

export const featureLabels: Record<FeatureKey, string> = {
  advancedSearch: 'Advanced Search', customRecommendation: 'Custom Recommendation', shorts: 'Shorts', live: 'Live',
  chapters: 'Chapters', comments: 'Comments', captions: 'Captions', abRepeat: 'A-B Repeat', temporaryBoost: 'Temporary Boost', pip: 'PiP',
  watchInbox: 'Watch Inbox', smartFolders: 'Smart Folders', tags: 'Tags', savedQueue: 'Saved Queue',
  sponsorSegments: 'Sponsor Segments', compare: 'Compare', statistics: 'Statistics', chatgpt: 'ChatGPT Recommendations',
  liveChat: 'Live Chat', dvr: 'DVR', upcoming: 'Upcoming', aiPromptBuilder: 'Prompt Builder', aiImport: 'AI Import', aiSmartSearch: 'Smart Search'
}

export const featureGroups: Array<{ label: string; keys: FeatureKey[] }> = [
  { label: 'Discovery', keys: ['advancedSearch', 'customRecommendation', 'shorts', 'live'] },
  { label: 'Watch', keys: ['chapters', 'comments', 'captions', 'abRepeat', 'temporaryBoost', 'pip'] },
  { label: 'Organization', keys: ['watchInbox', 'smartFolders', 'tags', 'savedQueue'] },
  { label: 'Advanced', keys: ['sponsorSegments', 'compare', 'statistics', 'chatgpt'] }
]

export const featureDependencies: Partial<Record<FeatureKey, FeatureKey>> = {
  liveChat: 'live', dvr: 'live', upcoming: 'live',
  aiPromptBuilder: 'chatgpt', aiImport: 'chatgpt', aiSmartSearch: 'chatgpt'
}

export const featureChildren: Partial<Record<FeatureKey, FeatureKey[]>> = {
  live: ['liveChat', 'dvr', 'upcoming'],
  chatgpt: ['aiPromptBuilder', 'aiImport', 'aiSmartSearch']
}

const enabled: Record<FeatureKey, boolean> = Object.fromEntries(
  Object.keys(featureLabels).map((key) => [key, true]),
) as Record<FeatureKey, boolean>

export const defaultSettings: AppSettings = {
  theme: { mode: 'system', surface: 'neutral', accent: '#f5a814' },
  layout: {
    sidebarMode: 'expanded', sidebarOrder: ['home', 'search', 'channels', 'library', 'queue', 'history', 'inbox', 'settings'],
    sidebarHidden: [], cardSize: 'comfortable', rightPaneWidth: 360, defaultWatchTab: 'queue', focusMode: false, cinemaMode: false
  },
  playback: { globalRate: 1, speedPresets: [1, 1.25, 1.5, 2, 2.5, 3, 4, 8], seekSeconds: 10, boostMode: 'next', continuousPlay: true },
  features: enabled,
  homeOrder: ['continue', 'inbox', 'new', 'recommended', 'categories', 'favorites'],
  homeHidden: [], cacheLimitMb: 250, cloudSync: false,
  blacklist: { videos: [], channels: [], keywords: [] }, whitelistChannels: [], whitelistOnly: false,
  updatedAt: new Date(0).toISOString()
}

export function isFeatureRuntimeEnabled(features: Record<FeatureKey, boolean>, feature: FeatureKey): boolean {
  if (!features[feature]) return false
  const parent = featureDependencies[feature]
  return parent ? isFeatureRuntimeEnabled(features, parent) : true
}

export function createDefaultState(): PersistedAppState {
  return {
    settings: structuredClone(defaultSettings), videos: {}, queue: [], savedQueues: [], favorites: [], watchLater: [], inbox: [], history: {},
    folders: [], tags: [], smartFolders: [], notes: [], channelPreferences: [], videoPreferences: [], autoAddRules: [], searchHistory: [], aiImportHistory: [], revision: 0,
    syncMetadata: {
      settings: {},
      added: { favorites: {}, watchLater: {}, inbox: {} },
      removed: { favorites: {}, watchLater: {}, inbox: {}, history: {}, folders: {}, tags: {}, savedQueues: {}, smartFolders: {}, notes: {}, channelPreferences: {}, videoPreferences: {}, autoAddRules: {} },
      queueUpdatedAt: new Date(0).toISOString()
    },
    updatedAt: new Date(0).toISOString()
  }
}
