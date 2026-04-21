import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const appRootPlaceholder = '__EASYCOUNT_APP_ROOT__'

// Production assets live under /login-app/; index.php rewrites this prefix for subdirectory installs.
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'login-app-root-meta',
      transformIndexHtml(html, ctx) {
        if (ctx.server) {
          return html.replace(appRootPlaceholder, '')
        }
        return html
      },
    },
  ],
  base: '/login-app/',
  build: {
    outDir: '../login-app',
    emptyOutDir: true,
  },
  server: {
    port: 5174,
    proxy: {
      '^/(login_process\\.php|reset-password\\.php)': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
      '^/api/': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
      '^/images/': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
    },
  },
})
