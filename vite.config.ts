import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const base = process.env.GITHUB_PAGES === 'true' ? '/VistaPlay/' : '/'
const appPath = (path: string) => `${base}${path}`

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: [
        'vistaplay-icon-192-v3.png',
        'vistaplay-icon-v3.svg',
        'vistaplay-maskable-v3.svg',
        'vistaplay-apple-touch-icon-v3.png',
        'vistaplay-icon-512-v2.png'
      ],
      manifest: {
        name: 'VistaPlay',
        short_name: 'VistaPlay',
        description: 'Tablet-first local-first video client powered by official YouTube capabilities.',
        theme_color: '#f7f7f4',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'any',
        start_url: base,
        scope: base,
        icons: [
          { src: appPath('vistaplay-icon-192-v3.png'), sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: appPath('vistaplay-icon-v3.svg'), sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: appPath('vistaplay-icon-512-v2.png'), sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: appPath('vistaplay-maskable-v3.svg'), sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' }
        ],
        shortcuts: [
          { name: 'Search', short_name: 'Search', url: appPath('search') },
          { name: 'Watch Inbox', short_name: 'Inbox', url: appPath('inbox') }
        ],
        share_target: {
          action: appPath('share-target'),
          method: 'GET',
          params: { title: 'title', text: 'text', url: 'url' }
        }
      },
      workbox: {
        navigateFallback: 'index.html',
        globPatterns: ['**/*.{js,css,html,png,webp,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/i\.ytimg\.com\//,
            handler: 'CacheFirst',
            options: { cacheName: 'youtube-thumbnails', expiration: { maxEntries: 200, maxAgeSeconds: 86400 } }
          }
        ]
      }
    })
  ]
})
