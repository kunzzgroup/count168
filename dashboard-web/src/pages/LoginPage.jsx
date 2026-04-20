import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { resolveApiPath } from '../lib/resolveApiPath.js'

function showAlertModal(title, message) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('alertModalOverlay')
    const titleEl = document.getElementById('modalTitle')
    const messageEl = document.getElementById('modalMessage')
    const confirmBtn = document.getElementById('modalConfirmBtn')
    if (!overlay || !titleEl || !messageEl || !confirmBtn) {
      window.alert(message)
      resolve()
      return
    }
    titleEl.textContent = title || 'Notice'
    messageEl.textContent = message || ''
    overlay.classList.add('is-open')
    overlay.setAttribute('aria-hidden', 'false')
    function close() {
      overlay.classList.remove('is-open')
      overlay.setAttribute('aria-hidden', 'true')
      confirmBtn.removeEventListener('click', onConfirm)
      overlay.removeEventListener('click', onOverlayClick)
      document.removeEventListener('keydown', onEscape)
      resolve()
    }
    function onConfirm() {
      close()
    }
    function onOverlayClick(e) {
      if (e.target === overlay) close()
    }
    function onEscape(e) {
      if (e.key === 'Escape') close()
    }
    confirmBtn.addEventListener('click', onConfirm)
    overlay.addEventListener('click', onOverlayClick)
    document.addEventListener('keydown', onEscape)
  })
}

export default function LoginPage() {
  const [searchParams] = useSearchParams()
  const [roleTab, setRoleTab] = useState(() =>
    searchParams.get('role') === 'member' ? 'member' : 'admin'
  )
  const [companyId, setCompanyId] = useState('')
  const [userId, setUserId] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const verifyTimeoutRef = useRef(null)

  useEffect(() => {
    const role = searchParams.get('role')
    if (role === 'member') setRoleTab('member')
  }, [searchParams])

  const verifyCompanyId = useCallback((value) => {
    if (!value || value.trim() === '') return
    const fd = new FormData()
    fd.append('company_id', value)
    fetch(resolveApiPath('api/company/verify_api.php'), { method: 'POST', body: fd, credentials: 'include' }).catch(() => {})
  }, [])

  useEffect(() => {
    return () => {
      if (verifyTimeoutRef.current) clearTimeout(verifyTimeoutRef.current)
    }
  }, [])

  useEffect(() => {
    async function loadMaintenance() {
      try {
        const response = await fetch(resolveApiPath('api/maintenance/get_public_api.php'), { credentials: 'include' })
        const result = await response.json()
        const wrapper = document.getElementById('maintenanceMarqueeWrapper')
        const track = document.getElementById('maintenanceMarqueeTrack')
        if (!wrapper || !track) return
        if (result.success && result.data && result.data.length > 0) {
          const escapeHtml = (t) => {
            const d = document.createElement('div')
            d.textContent = t
            return d.innerHTML
          }
          track.innerHTML = ''
          result.data.forEach((maintenance) => {
            const item1 = document.createElement('div')
            item1.className = 'maintenance-marquee-item'
            item1.innerHTML = `
              <span class="maintenance-marquee-dot"></span>
              <span class="maintenance-marquee-label">系统维护中:</span>
              <span>${escapeHtml(maintenance.content)}</span>`
            track.appendChild(item1)
            const item2 = document.createElement('div')
            item2.className = 'maintenance-marquee-item'
            item2.innerHTML = item1.innerHTML
            track.appendChild(item2)
          })
          wrapper.style.display = 'block'
        } else {
          wrapper.style.display = 'none'
        }
      } catch {
        const wrapper = document.getElementById('maintenanceMarqueeWrapper')
        if (wrapper) wrapper.style.display = 'none'
      }
    }
    loadMaintenance()
  }, [])

  const onCompanyInput = (e) => {
    const v = e.target.value
    const cursor = e.target.selectionStart
    const upper = v.toUpperCase()
    setCompanyId(upper)
    requestAnimationFrame(() => {
      e.target.setSelectionRange(cursor, cursor)
    })
    clearTimeout(verifyTimeoutRef.current)
    verifyTimeoutRef.current = setTimeout(() => {
      if (upper.trim() !== '') verifyCompanyId(upper)
    }, 500)
  }

  const onUserInput = (e) => {
    const v = e.target.value
    const cursor = e.target.selectionStart
    const upper = v.toUpperCase()
    setUserId(upper)
    requestAnimationFrame(() => {
      e.target.setSelectionRange(cursor, cursor)
    })
  }

  async function onSubmit(e) {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    try {
      const fd = new FormData()
      fd.append('company_id', companyId.trim().toUpperCase())
      fd.append('password', password)
      fd.append('action', 'login')
      fd.append('login_role', roleTab === 'member' ? 'member' : 'admin')
      if (roleTab === 'member') {
        fd.append('account_id', userId.trim())
      } else {
        fd.append('login_id', userId.trim())
      }
      if (rememberMe) fd.append('remember_me', '1')

      const response = await fetch(resolveApiPath('api/auth/login'), {
        method: 'POST',
        body: fd,
        credentials: 'include'
      })
      const data = await response.json()
      if (data.status === 'success' && data.bootstrapToken) {
        const dir = window.location.pathname.replace(/[^/]*$/, '') || '/'
        window.location.href = dir + 'login_bootstrap.php?t=' + encodeURIComponent(data.bootstrapToken)
      } else if (data.status === 'success' && data.redirect) {
        window.location.href = data.redirect
      } else {
        await showAlertModal('Notice', data.message || 'Login failed')
      }
    } catch (err) {
      console.error(err)
      await showAlertModal('Notice', 'An error occurred during login')
    } finally {
      setSubmitting(false)
    }
  }

  const isMember = roleTab === 'member'

  return (
    <>
      <div className="login-container">
        <div className="maintenance-marquee-wrapper" id="maintenanceMarqueeWrapper" style={{ display: 'none' }}>
          <div className="maintenance-marquee-track" id="maintenanceMarqueeTrack" />
        </div>

        <div className="role-tabs">
          <button
            type="button"
            className={`role-tab ${!isMember ? 'active' : ''}`}
            id="admin-tab"
            onClick={() => setRoleTab('admin')}
          >
            Admin
          </button>
          <button
            type="button"
            className={`role-tab ${isMember ? 'active' : ''}`}
            id="member-tab"
            onClick={() => setRoleTab('member')}
          >
            Member
          </button>
        </div>

        <div className="login-card">
          <div className="form-content">
            <form className="login-form" id="loginForm" method="POST" onSubmit={onSubmit}>
              <div className="input-group">
                <i className="fas fa-building input-icon" />
                <input
                  type="text"
                  placeholder="Company / Group ID"
                  id="company-id"
                  name="company_id"
                  required
                  value={companyId}
                  onChange={onCompanyInput}
                  onBlur={() => companyId.trim() !== '' && verifyCompanyId(companyId)}
                />
              </div>

              <div className="input-group">
                <i className="fas fa-user input-icon" />
                <input
                  type="text"
                  placeholder={isMember ? 'Account Id' : 'Username'}
                  id="user-id"
                  name={isMember ? 'account_id' : 'login_id'}
                  required
                  value={userId}
                  onChange={onUserInput}
                />
              </div>

              <div className="input-group">
                <i className="fas fa-lock input-icon" />
                <input
                  type="password"
                  placeholder="Password"
                  id="password"
                  name="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <div className="form-options">
                <label className="remember-switch">
                  <input
                    type="checkbox"
                    name="remember_me"
                    value="1"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  <span className="slider" />
                  <span className="remember-text">Remember me</span>
                </label>
                <a
                  href="reset-password.php"
                  className="forgot-link"
                  style={{ display: isMember ? 'none' : 'block' }}
                >
                  Forget Password?
                </a>
              </div>

              <button type="submit" className="login-btn" disabled={submitting}>
                <span>{submitting ? '…' : 'Login'}</span>
              </button>
            </form>
          </div>
        </div>
      </div>

      <img src="images/telegram.png" alt="Telegram" className="telegram-icon" />

      <div id="alertModalOverlay" className="modal-overlay" aria-hidden="true">
        <div className="modal-box" role="dialog" aria-labelledby="modalTitle" aria-describedby="modalMessage">
          <div className="modal-icon-wrap">
            <i className="fas fa-exclamation-triangle modal-icon" aria-hidden="true" />
          </div>
          <h3 id="modalTitle" className="modal-title">
            Notice
          </h3>
          <p id="modalMessage" className="modal-message" />
          <div className="modal-actions">
            <button type="button" id="modalConfirmBtn" className="modal-btn modal-btn-primary">
              Confirm
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
