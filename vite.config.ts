import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: {
        name: 'DeliveryEase',
        short_name: 'DeliveryEase',
        description: 'DeliveryEase - orders, deliveries and tracking',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          { src: '/icons/manifest-icon-192.maskable.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: '/icons/manifest-icon-512.maskable.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
          { src: '/icons/apple-icon-180.png', sizes: '180x180', type: 'image/png', purpose: 'any' }
        ]
      },
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,ico,png,svg}']
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
