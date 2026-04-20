import { createRoot } from 'react-dom/client'
import DashboardPage from './DashboardPage.jsx'

const el = document.getElementById('root')
if (el) {
  createRoot(el).render(<DashboardPage />)
}
