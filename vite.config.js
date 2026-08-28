import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['gordon-college-logo.png'],
      devOptions: {
        enabled: true
      },
      manifest: {
        name: 'Gordon College Clinic Appointment System',
        short_name: 'GC Clinic',
        description: 'Gordon College Clinic Appointment System — Admin Portal',
        theme_color: '#044B0E',
        background_color: '#044B0E',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: 'gordon-college-logo.png',
            sizes: '420x384',
            type: 'image/png'
          }
        ]
      }
    })
  ],
  server: {
    port: 5173
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('@supabase')) return 'supabase'
            if (id.includes('react-router') || id.includes('@remix-run')) return 'router'
            if (
              id.includes('react-dom') ||
              id.includes('/react/') ||
              id.includes('scheduler')
            ) {
              return 'react'
            }
            // Keep dynamically-imported libs as their own lazy chunks
            if (
              id.includes('jspdf') ||
              id.includes('html2canvas') ||
              id.includes('dompurify') ||
              id.includes('purify')
            ) {
              return undefined
            }
            return 'vendor'
          }
        },
      },
    },
  },
})
