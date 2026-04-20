import './App.css'
import { Sidebar } from './components/Sidebar'

function App() {
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="content-shell">
        <div className="content-placeholder">
          <h1>React Frontend Ready</h1>
          <p>Sidebar 设计已迁移，后续页面可逐步从 PHP 迁到 React。</p>
        </div>
      </main>
    </div>
  )
}

export default App
