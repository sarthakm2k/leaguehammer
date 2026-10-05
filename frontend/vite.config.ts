import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:5050',
        changeOrigin: true
      },
      '/health': {
        target: 'http://localhost:5050',
        changeOrigin: true
      },
      '/hubs': {
        target: 'http://localhost:5050',
        ws: true
      }
    }
  }
})
