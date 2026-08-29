# Release Checklist

## Automated gate

- [ ] Clean dependency install
- [ ] TypeScript typecheck
- [ ] ESLint without errors
- [ ] Unit tests: feature dependencies, player math, AI validation, YouTube parsing, statistics, IndexedDB
- [ ] Production build and generated service worker
- [ ] Manifest includes 192/512/maskable icons and share target

## Browser smoke

- [ ] Home renders at tablet landscape and portrait sizes
- [ ] Direct video URL/ID routes to Watch without autoplay
- [ ] Player persists into docked mini player across route change
- [ ] Queue FIFO/dedupe/reorder and undo removal
- [ ] Favorites, History, Inbox, Folder, Tag, Smart Folder and Note persist after reload
- [ ] Disabled feature UI and dependent routes disappear
- [ ] Search state and scroll restore after Watch → Back
- [ ] Invalid/oversize/wrong-version AI JSON is rejected; valid IDs are remotely verified
- [ ] Offline reload keeps shell and local data
- [ ] Reduced Motion removes large movement
- [ ] No blocking console error on primary local-only flow

## Connected capability gate

- [ ] YouTube API key restricted by deployed origin and API
- [ ] Keyword/channel/playlist/comments capability verified with real quota
- [ ] Supabase migration applied and RLS tested with two users
- [ ] Google OAuth redirect origins approved
- [ ] Sync preserves local data on logout
- [ ] SponsorBlock failure is graceful

## Release record

Record branch, commit SHA, build output, test counts, preview URL, environment key names (never values), connected-capability results and remaining browser/device limitations. Do not mark the release complete while any mandatory automated or primary-flow gate is failing.
