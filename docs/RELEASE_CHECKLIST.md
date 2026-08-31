# Release Checklist

## Pre-publication automated gate

- [x] Clean dependency install
- [x] TypeScript typecheck
- [x] ESLint without errors
- [x] Unit tests: feature dependencies, player math, AI validation, YouTube parsing, statistics, IndexedDB and sync merge logic
- [x] Production build and generated service worker
- [x] Manifest includes 192/512/maskable icons and share target
- [x] No committed YouTube API key or Supabase project URL detected; `.env.example` contains empty public configuration placeholders only

## Pre-publication browser smoke

Verified in GitHub Actions with Playwright Chromium:

- [x] Home renders at tablet landscape and portrait viewport sizes without horizontal overflow
- [x] Direct video route opens Watch without unnecessary autoplay
- [x] Player persists as docked mini player across route changes
- [x] Queue dedupe/reorder/remove/undo and IndexedDB persistence
- [x] Favorite, Note and archived History state persist after reload/navigation
- [x] Disabled feature UI and dependent route are guarded
- [x] Search query, results and scroll position restore after Watch → Back
- [x] Invalid, oversize and wrong-version AI JSON is rejected
- [x] Offline reload keeps the PWA shell and local IndexedDB state
- [x] Reduced Motion removes large transform motion
- [x] No blocking same-origin console/page error in the primary smoke flows

## Final code closure

- [x] Search restoration race fixed
- [x] Edge Swipe Back start zone is anchored to the content boundary so it remains reachable when the sidebar is visible
- [x] Feature-toggle browser test uses the visible 52 px label hit target rather than the hidden checkbox input
- [x] Development branch is fully pushed to GitHub

## Post-publication human device QA

These are intentionally performed by the owner on the published completed version, not used to delay Git publication:

- [ ] Android tablet landscape primary pass
- [ ] Tablet portrait pass
- [ ] Phone and desktop secondary pass
- [ ] Real touch Edge Swipe Back
- [ ] Fullscreen enter/exit on the target browser/device
- [ ] Inbox, Folder, Tag and Smart Folder end-to-end persistence on device
- [ ] PWA install, launch and offline behavior on device
- [ ] Real YouTube Embedded Player behavior
- [ ] YouTube Data API capabilities when an API key is configured
- [ ] Google OAuth / Supabase cloud sync when those optional services are configured
- [ ] SponsorBlock network-failure behavior on a real network

## Configuration notes

- `VITE_YOUTUBE_API_KEY` is optional for local Library/History/Queue/organization/settings/AI validation behavior. If configured, restrict it by origin and to YouTube Data API v3.
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are optional cloud-sync configuration. The repository contains migrations, but no Supabase project is required for the local-first application to run.
- Never commit server secrets or unrestricted credentials in `VITE_*`.

## Release record

Release-candidate code checkpoint: `9c59e3df2ec861361f421226a5aff4ee32ccee93` on `feature/production-v1` (2026-08-31).

The previous complete browser-smoke run at `282f7a35e3e8533325dc6a374cde59d28cddcba9` passed clean install, typecheck, lint, 15 test files / 61 tests, production build, 47-entry PWA precache and all five Playwright Chromium smoke tests in GitHub Actions run `33388098438`. The code checkpoint above adds the final Edge Swipe Back coordinate correction; its CI result must be green before merging to `main`.

After publication to `main`, device-specific and configuration-dependent checks above are handed to the owner for final real-device acceptance.
