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
      includeAssets: ['icon-192.webp', 'icon-512.webp', 'maskable-512.webp'],
      manifest: {
        name: 'VistaPlay',
        short_name: 'VistaPlay',
        description: 'Tablet-first local-first video client powered by official YouTube capabilities.',
        theme_color: '#f7f7f4',
        background_color: '#f7f7f4',
        display: 'standalone',
        orientation: 'any',
        start_url: base,
        scope: base,
        icons: [
          { src: appPath('icon-192.webp'), sizes: '192x192', type: 'image/webp' },
          { src: appPath('icon-512.webp'), sizes: '512x512', type: 'image/webp' },
          { src: appPath('maskable-512.webp'), sizes: '512x512', type: 'image/webp', purpose: 'maskable' }
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
