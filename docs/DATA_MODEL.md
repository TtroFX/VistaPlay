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

## IndexedDB

Schema version 3 stores settings, videos, queue, progress, sessions, library, cache and migration records. Before a version upgrade, all existing stores are copied to `vistaplay-backups`; snapshots older than seven days are removed only after a successful backup write.

## Cloud conflict baseline

The Supabase v1 adapter uses a whole-state monotonic revision as the transport gate. Entity timestamps and tombstone-ready models are preserved so the next migration can apply field-level LWW, set add/remove clocks, sticky Completed, History union, Progress latest-wins, and Queue whole-version rules without changing local IDs. Cache and AI conversation text never sync.

Current cloud sync chooses the higher revision, then writes one incremented revision. This avoids silent overwrites but is not a collaborative real-time editor.
