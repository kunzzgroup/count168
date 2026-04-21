import './initAppRoot.js'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './login.css'
import LoginApp from './LoginApp.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <LoginApp />
  </StrictMode>,
)
