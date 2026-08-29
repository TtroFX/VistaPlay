# VistaPlay

VistaPlay is a tablet-first, local-first video client PWA. Playback uses the official YouTube Embedded Player; optional remote metadata uses YouTube Data API v3. The product name deliberately does not use “YouTube” as its public application name.

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

No environment value is required for local Library, History, Queue, organization, settings, AI JSON validation, or IndexedDB persistence. Keyword search, metadata verification, Google login, and cloud sync activate only when their documented public configuration is present.

## Quality gates

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Configuration

- `VITE_YOUTUBE_API_KEY`: browser API key restricted to the deployed origins and YouTube Data API v3.
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`: public Supabase project configuration.
- `VITE_GOOGLE_CLIENT_ID`: reserved for direct Google capability work; current OAuth route uses Supabase Google provider.

Never put server secrets in `VITE_*`. Supabase auth uses `sessionStorage`, not `localStorage`. Apply [the migration](supabase/migrations/202608290001_initial.sql) before cloud sync.

Product and implementation specifications live in [`docs`](docs/PRODUCT_SPEC.md). Active development branch: `feature/production-v1`.
