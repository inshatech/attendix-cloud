import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'
const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [react()],
  build: {
    outDir: '../dist',    // built files go to project root /dist
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api':           { target: 'http://localhost:8000', changeOrigin: true },
      '/auth':          { target: 'http://localhost:8000', changeOrigin: true },
      '/admin':         { target: 'http://localhost:8000', changeOrigin: true },
      '/user':          { target: 'http://localhost:8000', changeOrigin: true },
      '/organizations': { target: 'http://localhost:8000', changeOrigin: true },
      '/subscriptions': { target: 'http://localhost:8000', changeOrigin: true },
      '/tawk-config':   { target: 'http://localhost:8000', changeOrigin: true },
      '/chat':          { target: 'http://localhost:8000', changeOrigin: true },
      '/tickets':       { target: 'http://localhost:8000', changeOrigin: true },
      '/webhooks':      { target: 'http://localhost:8000', changeOrigin: true },
      '/bridge-app':    { target: 'http://localhost:8000', changeOrigin: true },
      '/machine-users': { target: 'http://localhost:8000', changeOrigin: true },
    },
  },
})