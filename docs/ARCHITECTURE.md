# Architecture

## Runtime boundaries

| Boundary | Owner |
|---|---|
| UI state and routes | React Router + route-local state |
| Player state | `PlayerEngine` EventTarget; React subscribes to snapshots |
| YouTube remote state | typed API adapter with bounded retry and cache |
| Local persistent state | IndexedDB repository, schema v3 |
| Cloud sync state | optional Supabase adapter with RLS |
| Auth state | Supabase auth in session storage |
| Feature configuration | persisted settings + recursive runtime dependency resolver |

The Player Engine owns YouTube IFrame API lifecycle and is not recreated by route transitions. UI actions invoke its public methods; player events flow back as immutable snapshots.

## Data path

UI mutations update a single normalized application state, debounce it into IndexedDB, and separately write append-only WatchSessions. API metadata is verified before replacing untrusted imported metadata. Search/cache data uses an evictable store; user data never participates in cache eviction. Cloud payloads exclude cache-only video metadata; after merge, referenced IDs are rehydrated through YouTube verification, embedded queue metadata, or safe offline fallbacks.

## Failure strategy

- YouTube 429/5xx/network: exponential backoff with jitter, maximum two retries after the first request.
- API or cloud configuration absent: capability notice and local-only behavior.
- Deleted/private media: preserve local metadata and availability state.
- DB upgrade: snapshot old stores to a separate backup DB before schema upgrade; retain seven days; never delete the old DB on migration error.
- PWA update: prompt user, never force reload during playback.

## Security

No `eval`, `Function`, arbitrary HTML injection or generated JavaScript execution. AI import is JSON-only, bounded before parsing, and verified by video ID. OAuth is not written to `localStorage`. Authorization-bearing Google/YouTube responses are never stored by the Service Worker; bounded public metadata/search caching is owned by IndexedDB. Server secrets must not use the `VITE_` namespace.
