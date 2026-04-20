import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from '../components/Sidebar.jsx'

export default function AppLayout() {
  useEffect(() => {
    const id = window.setTimeout(() => {
      if (typeof window.__sidebarInit === 'function') window.__sidebarInit()
    }, 0)
    return () => window.clearTimeout(id)
  }, [])

  return (
    <>
      <Sidebar />
      <div className="ec-spa-outlet">
        <Outlet />
      </div>
    </>
  )
}
