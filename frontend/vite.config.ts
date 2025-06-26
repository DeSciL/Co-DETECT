import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

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
    // Ensure compatibility with various Node.js versions
    target: 'es2020',
    // Increase chunk size limit to avoid warnings
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        // Optimized chunk splitting for production
        manualChunks: {
          vendor: ['react', 'react-dom'],
          router: ['react-router-dom'],
          ui: ['antd'],
          utils: ['d3', 'react-window', 'react-joyride']
        }
      }
    }
  }
})
