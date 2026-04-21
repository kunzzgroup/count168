import { useEffect, useState } from 'react'
import Sidebar from './components/sidebar/Sidebar.jsx'
import AnnouncementManagementPage from './pages/announcement/AnnouncementManagementPage.jsx'
import AdminPage from './pages/admin/AdminPage.jsx'
import AccountPage from './pages/account/AccountPage.jsx'
import ProcessPage from './pages/process/ProcessPage.jsx'
import DashboardPage from './pages/dashboard/DashboardPage.jsx'
import DomainPage from './pages/domain/DomainPage.jsx'
import './App.css'

function normalizeRoute(pathname) {
  const path = (pathname || '/').toLowerCase()
  if (path.endsWith('/dashboard')) return '/dashboard'
  if (path.endsWith('/domain')) return '/domain'
  if (path.endsWith('/announcement')) return '/announcement'
  if (path.endsWith('/admin')) return '/admin'
  if (path.endsWith('/account')) return '/account'
  if (path.endsWith('/process')) return '/process'
  if (path.endsWith('/logout')) return '/logout'
  return '/dashboard'
}

function App() {
  const [currentRoute, setCurrentRoute] = useState(normalizeRoute(window.location.pathname))

  useEffect(() => {
    const onPopState = () => setCurrentRoute(normalizeRoute(window.location.pathname))
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  return (
    <div className="app-layout">
      <Sidebar currentRoute={currentRoute} />
      <main className="app-content">
        {currentRoute === '/dashboard' ? (
          <DashboardPage />
        ) : currentRoute === '/domain' ? (
          <DomainPage />
        ) : currentRoute === '/announcement' ? (
          <AnnouncementManagementPage />
        ) : currentRoute === '/admin' ? (
          <AdminPage />
        ) : currentRoute === '/account' ? (
          <AccountPage />
        ) : currentRoute === '/process' ? (
          <ProcessPage />
        ) : currentRoute === '/logout' ? (
          <section style={{ padding: '16px' }}>
            <h1 style={{ margin: 0, color: '#0f172a' }}>Logout</h1>
            <div style={{ height: 1, background: '#e2e8f0', margin: '12px 0 16px' }} />
            <div style={{ color: '#334155' }}>请继续接入一个 API 退出端点（例如 `/api/auth/logout`）后即可完全移除 PHP 前端依赖。</div>
          </section>
        ) : (
          <DashboardPage />
        )}
      </main>
    </div>
  )
}

export default App
