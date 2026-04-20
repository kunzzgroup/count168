import { createRoot } from 'react-dom/client'
import App from './App.jsx'

const el = document.getElementById('root')
if (el) {
  createRoot(el).render(<App />)
}
