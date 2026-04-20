import { createRoot } from 'react-dom/client'
import { installResolveApiPath } from './lib/resolveApiPath.js'
import App from './App.jsx'

if (import.meta.env.VITE_API_BASE_URL) {
  window.__API_BASE_URL__ = import.meta.env.VITE_API_BASE_URL
}
installResolveApiPath()

const el = document.getElementById('root')
if (el) {
  createRoot(el).render(<App />)
}
