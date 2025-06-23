import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Disable caching for static assets in development
    headers: {
      'Cache-Control': 'no-store'
    }
  },
  // Configure static assets to avoid caching issues
  publicDir: 'public',
  build: {
    rollupOptions: {
      output: {
        // Add hash to filenames in production for cache busting
        assetFileNames: '[name].[hash].[ext]'
      }
    }
  }
})
