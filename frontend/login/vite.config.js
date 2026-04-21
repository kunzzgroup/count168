import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const appRootPlaceholder = '__EASYCOUNT_APP_ROOT__'

// 本目录：源码 + 构建结果 dist/。对外静态路径 /login/（.htaccess → frontend/login/dist/）
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'login-html-app-root',
      transformIndexHtml(html, ctx) {
        if (ctx.server) {
          return html.replace(appRootPlaceholder, '')
        }
        return html
      },
    },
  ],
  base: '/login/',
  build: {
    outDir: 'dist',
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
