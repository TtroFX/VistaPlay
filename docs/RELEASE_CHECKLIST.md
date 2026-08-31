# Release Checklist

## Automated gate

- [x] Clean dependency install
- [x] TypeScript typecheck
- [x] ESLint without errors
- [x] Unit tests: feature dependencies, player math, AI validation, YouTube parsing, statistics, IndexedDB
- [x] Production build and generated service worker
- [x] Manifest includes 192/512/maskable icons and share target

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

Latest automated record (2026-08-31): source checkpoint `181589b` on `feature/production-v1`; clean install, typecheck, lint, 15 test files / 60 tests, production build, 47-entry PWA precache, manifest/share target and local SPA route delivery passed. GitHub Actions run `33377007862` passed. Interactive browser and connected-capability boxes remain open until a reachable preview with deployment environment values is available.
