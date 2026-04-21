/**
 * 登录 React 包：构建输出在本目录 dist/。页面 src/pages/login/；工具 src/lib/pathUtils.js。
 */
import './initAppRoot.js'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './pages/login/login.css'
import LoginApp from './pages/login/LoginApp.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <LoginApp />
  </StrictMode>,
)
