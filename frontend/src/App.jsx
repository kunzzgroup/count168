import { useEffect, useState } from 'react'
import Sidebar from './components/sidebar/Sidebar.jsx'
import AnnouncementManagementPage from './pages/announcement/AnnouncementManagementPage.jsx'
import AdminPage from './pages/admin/AdminPage.jsx'
import AccountPage from './pages/account/AccountPage.jsx'
import ProcessPage from './pages/process/ProcessPage.jsx'
import './App.css'

function App() {
  const [currentRoute, setCurrentRoute] = useState(window.location.hash || '#/')

  useEffect(() => {
    const onHashChange = () => setCurrentRoute(window.location.hash || '#/')
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  return (
    <div className="app-layout">
      <Sidebar currentRoute={currentRoute} />
      <main className="app-content">
        {currentRoute === '#/admin' ? (
          <AdminPage />
        ) : currentRoute === '#/account' ? (
          <AccountPage />
        ) : currentRoute === '#/process' ? (
          <ProcessPage />
        ) : (
          <AnnouncementManagementPage />
        )}
      </main>
    </div>
  )
}

export default App
