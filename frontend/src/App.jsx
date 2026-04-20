import './App.css'
import { Sidebar } from './components/Sidebar'
import { AnnouncementMaintenancePage } from './components/AnnouncementMaintenancePage'

function App() {
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="content-shell">
        <AnnouncementMaintenancePage />
      </main>
    </div>
  )
}

export default App
