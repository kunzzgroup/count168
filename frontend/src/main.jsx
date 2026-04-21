/**
 * 主后台（公告/维护 + Admin/Account/Process）入口。
 * 目录约定：pages/<feature>/ 页面组件；components/sidebar/ 侧栏；lib/ 共享请求逻辑。
 * 登录独立包：../login/（源码 src/，构建 dist/，URL 前缀 /login/，由 PHP index.php + .htaccess 托管）。
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
