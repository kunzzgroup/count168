import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import DashboardPage from './DashboardPage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import MemberPage from './pages/MemberPage.jsx'
import PlaceholderPage from './pages/PlaceholderPage.jsx'
import LegacyEmbedPage from './pages/LegacyEmbedPage.jsx'
import LegacyRedirect from './pages/LegacyRedirect.jsx'
import AppLayout from './layout/AppLayout.jsx'
import { routeConfig } from './routeConfig.js'

function routePath(p) {
  return p.replace(/^\//, '')
}

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
        {routeConfig
          .filter((r) => r.fullPage)
          .map((r) => (
            <Route
              key={r.path}
              path={routePath(r.path)}
              element={<LegacyRedirect legacyFile={r.legacyFile} />}
            />
          ))}
        <Route element={<AppLayout />}>
          <Route index element={<RootRedirect />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="member" element={<MemberPage />} />
          {routeConfig
            .filter(
              (r) =>
                r.path !== '/dashboard' &&
                r.path !== '/login' &&
                r.path !== '/member' &&
                !r.fullPage
            )
            .map((r) => (
              <Route
                key={r.path}
                path={routePath(r.path)}
                element={
                  r.legacyEmbed ? (
                    <LegacyEmbedPage title={r.title} legacyFile={r.legacyFile} />
                  ) : (
                    <PlaceholderPage title={r.title} legacyFile={r.legacyFile} />
                  )
                }
              />
            ))}
          <Route path="*" element={<Navigate to={defaultSpaPath()} replace />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
