# Data Model and Sync

## Local entities

The domain includes `VideoRef`, `QueueItem`, `SavedQueue`, `WatchProgress`, `WatchSession`, `Folder`, `Tag`, `SmartFolder`, `Note`, `ChannelPreference`, `VideoPreference`, `AppSettings`, and AI import history. App state also indexes favorites, Watch Later, Inbox and search history by video/query ID.

Constraints enforced in code:

- Queue video IDs are unique; Play Next is FIFO.
- Saved Queue maximum is 100.
- Folder nesting is at most two levels.
- Tags are case-insensitive, first spelling wins, 32 characters maximum, and each video is limited to 20 tag associations.
- Note is plain text and limited to 20,000 characters.
- AI import history is local-only, maximum 50 and pruned at 30 days.

## Watch states

`UNWATCHED → WATCHING → COMPLETED → ARCHIVED`. Playback below 10 seconds does not promote to Watching. Completed is sticky across replay until explicit reset. Completion requires at least 90% position and the defined minimum watch time.

`WatchSession` stores total real/media playing seconds, rate-weighted intervals and seek events. It also records each actual PLAYING interval so pauses do not shift Heatmap time into buckets where playback did not occur; older sessions without interval data retain the continuous-session fallback.

## IndexedDB

Schema version 3 stores settings, videos, queue, progress, sessions, library, cache and migration records. Before a version upgrade, all existing stores are copied to `vistaplay-backups`; snapshots older than seven days are removed only after a successful backup write.

## Cloud conflict baseline

The Supabase adapter stores one RLS-protected payload per user and uses an optimistic monotonic revision gate. Before upload, both sides are merged using field clocks for Settings, add/remove clocks for Favorites/Watch Later/Inbox, History union with sticky Completed, latest Progress and Notes, and whole-version Queue LWW. Deletions use entity tombstones for History, Folder, Tag, Saved Queue, Smart Folder, Note, Channel/Video Preference and Auto Add Rule so stale devices cannot resurrect removed records. Tombstones are retained for 30 days.

Cached video metadata, the device player restore position, AI import history, and device-calibrated Right Pane width are local-only and are removed from the cloud payload. Cloud merges always preserve the receiving device's pane width. A revision-conditional update retries twice if another device writes between read and update.
