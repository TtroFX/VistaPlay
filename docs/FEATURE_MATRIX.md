# Feature Matrix

| Area | Implementation | Toggle / capability behavior |
|---|---|---|
| PWA | Manifest, install icons, Workbox precache/runtime cache, prompt update, share target | Offline local routes remain usable; playback is remote |
| Home | Continue, Inbox, subscription/local-favorite channel uploads, local recommendations, recent favorites; empty sections hidden | Remote refresh is explicit, capped at 100 subscriptions / 25 channels, and never polls in background |
| Search | Explicit submit, 25/page, 6h cache, video/channel/playlist, date/duration/live/exclusions/Shorts | Advanced UI hidden when disabled; API key required for keyword remote search |
| Player | Persistent IFrame API engine, no autoplay restore, external controls, speed resolution, seek, repeat, A–B, boost, volume, mute, fullscreen | PiP/DVR only when officially exposed; no cross-origin extraction |
| Navigation | Sidebar modes, deep links, stateful Search restore, docked mini player | Inbox/AI/Compare/Statistics routes guarded by features |
| Library | Favorites, Watch Later, folders, tags, Smart Folders, archive, notes | Folder max depth enforced; Smart Folders are computed, not manually populated |
| Queue | FIFO play-next, dedupe, reorder, shuffle, snapshots replace/append | Saved Queue hidden when disabled; max 100 |
| Channel / Playlist | Metadata, uploads, Shorts heuristic, Live tab, playback/Home/Shorts/queue local preferences; playlist read-only | YouTube API capability required; Shorts preference UI is removed when Shorts is disabled |
| Comments | 20 initial, explicit additional pages, 200/session max, relevance/newest, fetched-text search, collapsed replies, timestamp seeking | Network request occurs only while enabled/opened |
| Live | Official playback and official live-chat embed; normal Watch layout | Live tabs/requests removed when disabled; DVR left to Player capability |
| Sponsor | SponsorBlock public read-only segments; manual external skip action | No request when disabled; auto-skip default/off |
| Compare | Two official players, max 2, active player pauses the other, proportional seek | Route removed when disabled |
| Statistics | Real playing time, distinct video count, weighted speed, time saved, local-time 30m heatmap, channel totals | Derived from WatchSession records |
| Google / Sync | Supabase Google OAuth, read-only subscription refresh, RLS schema, opt-in conflict-aware revision sync, local logout preservation | Provider token is session-scoped and never written to localStorage; local-only mode remains fully usable |
| ChatGPT Bridge | Prompt presets, optional last 20 history, strict YTREC/Smart Search validation, max sizes/counts, YouTube metadata replacement | No OpenAI API; route/UI hidden when disabled |
| Accessibility | 44px minimum / 48px default touch targets, visible focus, semantic controls, Reduced Motion | WCAG 2.2 AA target; runtime visual QA required before public release |

## Core that cannot be disabled

Playback, Search, basic Library, History, Settings, Theme, and basic Queue. Sidebar visibility is a layout preference and does not disable the feature.
