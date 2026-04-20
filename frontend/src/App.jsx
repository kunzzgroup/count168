import { useEffect, useState } from 'react'
import Sidebar from './components/Sidebar'
import AdminPage from './pages/AdminPage'
import './App.css'

function App() {
  const [currentRoute, setCurrentRoute] = useState(window.location.hash || '#/')

  useEffect(() => {
    const onHashChange = () => setCurrentRoute(window.location.hash || '#/')
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  return (
    <div className='app-layout'>
      <Sidebar currentRoute={currentRoute} />
      <main className='app-content'>
        {currentRoute === '#/admin' ? <AdminPage /> : <h1>React Sidebar Ready</h1>}
      </main>
    </div>
  )
}

export default App
