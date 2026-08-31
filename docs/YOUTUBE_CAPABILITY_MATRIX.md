# YouTube Capability Matrix

| Capability | Official implementation | Fallback / limitation |
|---|---|---|
| Playback | YouTube IFrame Player API | Direct video ID remains usable without Data API key |
| Controls, ads, attribution | YouTube iframe controls remain visible | VistaPlay controls are outside the frame and do not intercept touch |
| Metadata/search/channel/playlist/comments | YouTube Data API v3 with origin-restricted browser key; Channel URLs accept canonical IDs and `@handle` resolution | Local metadata and direct URL playback remain available |
| Subscriptions / new uploads | Google OAuth `youtube.readonly`; subscriptions and local-favorite channels are merged on explicit Home refresh | At most 100 subscriptions, 25 channels and three recent uploads per channel per refresh; no background polling |
| Captions | YouTube Player standard caption UI | No iframe scraping; translation only for separately permitted text |
| Live | Embedded Player; official live chat embed | Live entry points disappear when disabled |
| DVR | YouTube Player capability only | No independent DVR implementation |
| PiP | Browser/OS/YouTube officially exposed capability only | No cross-origin video extraction; no fake PiP button |
| Chapters | Description timestamps first | No AI chapter generation in v1 |
| Shorts | Explicit context/metadata then duration heuristic | Low-confidence items remain normal video |
| Playlist write | Not requested by default | Read-only until explicit incremental OAuth consent is designed |
| Download | Not implemented | No button or unofficial route |

Production keys must be restricted in Google Cloud to the deployed origins and required APIs. Quota exhaustion is surfaced as a capability error, not hidden behind fabricated data.

Authorization-bearing subscription responses bypass Service Worker caching. VistaPlay caches public API data only through its versioned IndexedDB TTL/LRU layer.
