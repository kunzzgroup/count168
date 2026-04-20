import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import DashboardPage from './DashboardPage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import PlaceholderPage from './pages/PlaceholderPage.jsx'
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
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/" element={<RootRedirect />} />

        {routeConfig
          .filter((r) => r.path !== '/dashboard' && r.path !== '/login')
          .map((r) => (
            <Route
              key={r.path}
              path={r.path}
              element={<PlaceholderPage title={r.title} legacyFile={r.legacyFile} />}
            />
          ))}

        <Route path="*" element={<Navigate to={defaultSpaPath()} replace />} />
      </Routes>
    </HashRouter>
  )
}
