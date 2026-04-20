import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  base: './',
  root: __dirname,
  resolve: {
    alias: {
      '@site-css': path.resolve(__dirname, '../css')
    }
  },
  build: {
    outDir: path.resolve(__dirname, '../dashboard-app'),
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        entryFileNames: 'assets/dashboard-react.js',
        assetFileNames: 'assets/dashboard-react[extname]'
      }
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api/auth': { target: 'http://127.0.0.1:8090', changeOrigin: true },
      '/api': { target: 'http://127.0.0.1:8080', changeOrigin: true },
      '/js': { target: 'http://127.0.0.1:8080', changeOrigin: true },
      '/css': { target: 'http://127.0.0.1:8080', changeOrigin: true },
      '/images': { target: 'http://127.0.0.1:8080', changeOrigin: true }
    }
  }
})
