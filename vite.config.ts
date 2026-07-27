import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? '/training-tracker/' : '/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // 'prompt' (not 'autoUpdate'): surface a one-tap "New version" toast via
      // UpdatePrompt so a deploy applies on a single reload, instead of the
      // silent autoUpdate that left stale bundles cached until a full reinstall.
      registerType: 'prompt',
      manifest: {
        name: 'Training Tracker',
        short_name: 'Training',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        start_url: '/training-tracker/',
        scope: '/training-tracker/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
}))
