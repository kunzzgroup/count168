import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import DashboardPage from './DashboardPage.jsx'
import PlaceholderPage from './pages/PlaceholderPage.jsx'
import { routeConfig } from './routeConfig.js'

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />

        {routeConfig
          .filter((r) => r.path !== '/dashboard')
          .map((r) => (
            <Route
              key={r.path}
              path={r.path}
              element={<PlaceholderPage title={r.title} legacyFile={r.legacyFile} />}
            />
          ))}

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </HashRouter>
  )
}
