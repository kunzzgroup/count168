import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import DashboardPage from './DashboardPage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import MemberPage from './pages/MemberPage.jsx'
import PlaceholderPage from './pages/PlaceholderPage.jsx'
import AppLayout from './layout/AppLayout.jsx'
import { routeConfig } from './routeConfig.js'

function defaultSpaPath() {
  if (typeof window !== 'undefined' && typeof window.__SPA_DEFAULT_ROUTE === 'string') {
    return window.__SPA_DEFAULT_ROUTE
  }
  return '/dashboard'
}

function RootRedirect() {
  return <Navigate to={defaultSpaPath()} replace />
}

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<AppLayout />}>
          <Route index element={<RootRedirect />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="member" element={<MemberPage />} />
          {routeConfig
            .filter((r) => r.path !== '/dashboard' && r.path !== '/login' && r.path !== '/member')
            .map((r) => (
              <Route
                key={r.path}
                path={r.path.replace(/^\//, '')}
                element={<PlaceholderPage title={r.title} legacyFile={r.legacyFile} />}
              />
            ))}
          <Route path="*" element={<Navigate to={defaultSpaPath()} replace />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
