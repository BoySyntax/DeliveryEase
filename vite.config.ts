import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}']
      },
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'fordaGO',
        short_name: 'fordaGO',
        description: 'fordaGO - orders, deliveries and tracking',
        theme_color: '#16a34a',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          // Browser favicons - Bigger sizes
          {
            src: '/icons/appstore1.png',
            sizes: '32x32',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icons/appstore1.png',
            sizes: '64x64',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icons/appstore1.png',
            sizes: '96x96',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icons/appstore1.png',
            sizes: '128x128',
            type: 'image/png',
            purpose: 'any'
          },
          // Android icons
          {
            src: '/icons/appstore1.png',
            sizes: '36x36',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: '/icons/appstore1.png',
            sizes: '72x72',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: '/icons/appstore1.png',
            sizes: '96x96',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: '/icons/appstore1.png',
            sizes: '144x144',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: '/icons/appstore1.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: '/icons/appstore1.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          },
          // iOS icons
          {
            src: '/icons/appstore1.png',
            sizes: '57x57',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icons/appstore1.png',
            sizes: '60x60',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icons/appstore1.png',
            sizes: '76x76',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icons/appstore1.png',
            sizes: '114x114',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icons/appstore1.png',
            sizes: '120x120',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icons/appstore1.png',
            sizes: '144x144',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icons/appstore1.png',
            sizes: '152x152',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icons/appstore1.png',
            sizes: '180x180',
            type: 'image/png',
            purpose: 'any'
          }
        ]
      }
    })
  ],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  server: {
    port: 3008,
    host: true
  }
});
