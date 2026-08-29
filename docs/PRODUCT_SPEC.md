# VistaPlay Product Specification v1.0

## Product

VistaPlay is an Android-tablet-first, touch-first PWA for watching and organizing YouTube-hosted video through official capabilities. Landscape is primary; portrait, desktop, and Android phone layouts are supported. The public brand does not use “YouTube” as the product name.

The product objective is: many production-capable features, without making the default interface feel complicated. Visible UI is the union of core, user-enabled, and contextually available features.

## Core, always available

- Official embedded playback, Search/direct URL routing, basic Library, History, Settings, Theme, and basic Queue.
- Local-first IndexedDB persistence and offline access to local data.
- Home, Watch, Channel, Playlist, Library, Queue, History, and Settings routes.

## Optional feature families

- Discovery: advanced search, local recommendation, Shorts and Live entry points.
- Watch: chapters, comments, captions, A–B repeat, temporary boost and capability-based PiP.
- Organization: Watch Inbox, Smart Folders, Tags and Saved Queue.
- Advanced: SponsorBlock read-only segments, Compare, Statistics and ChatGPT Clipboard Bridge.

When a parent feature is disabled, dependent children are runtime-disabled without deleting stored settings. Disabled feature controls, tabs, routes, and network requests are removed.

## Primary flows

1. Launch → restore local data and previous player state without autoplay → Home.
2. Search or paste URL → Results/Direct route → Watch → Queue → Next.
3. Video → Inbox/Watch Later/Favorite → Folder/Tags → Queue → Watch.
4. Search or Watch → AI Prompt Builder → Clipboard → chatgpt.com → strict JSON import → schema validation → YouTube verification → Watch.

## Explicit exclusions

Pet UI, video download, ad blocking, iframe caption scraping, simultaneous dual playback, OpenAI API inference, background crawling, and AI automatic app control are not implemented and have no placeholders.

## Compliance order

When requirements conflict: YouTube official policy/API capability, then a safe fallback, then a documented difference. VistaPlay does not obscure YouTube controls or attribution, overlay the iframe, extract cross-origin media, or store backend secrets in the client.
