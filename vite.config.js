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
  }
})
