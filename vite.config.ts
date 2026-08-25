import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-32.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-192.png', 'icons/icon-maskable-512.png'],
      manifest: false, // public/manifest.webmanifest is served as-is and linked from index.html
      workbox: {
        // Precache the app shell (JS/CSS/fonts/icons) only — entries themselves flow through
        // the app-level offline queue (src/data/queue.ts), not Workbox runtime caching, since
        // Supabase writes need queue semantics rather than cache-then-network.
        globPatterns: ['**/*.{js,css,html,woff2,png,svg}'],
      },
    }),
  ],
})
