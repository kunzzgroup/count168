import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from '../components/Sidebar.jsx'

export default function AppLayout() {
  const location = useLocation()

  useEffect(() => {
    const id = window.setTimeout(() => {
      if (typeof window.__sidebarInit === 'function') window.__sidebarInit()
    }, 0)
    return () => window.clearTimeout(id)
  }, [location.pathname, location.search, location.hash])

  return (
    <>
      <Sidebar />
      <div className="ec-spa-outlet">
        <Outlet />
      </div>
    </>
  )
}
