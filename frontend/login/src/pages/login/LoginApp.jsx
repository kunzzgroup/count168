import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { appPath } from '../../lib/pathUtils.js'

const I18N = {
  en: {
    admin: 'Admin',
    member: 'Member',
    companyId: 'Company / Group ID',
    username: 'Username',
    accountId: 'Account Id',
    password: 'Password',
    rememberMe: 'Remember me',
    forgetPassword: 'Forget Password?',
    login: 'Login',
    notice: 'Notice',
    confirm: 'Confirm',
    loginError: 'An error occurred during login',
    maintenanceLabel: 'System Maintenance:',
  },
  zh: {
    admin: '管理员',
    member: '会员',
    companyId: '公司 / 集团 ID',
    username: '用户名',
    accountId: '账号 ID',
    password: '密码',
    rememberMe: '记住我',
    forgetPassword: '忘记密码？',
    login: '登录',
    notice: '提示',
    confirm: '确认',
    loginError: '登录时发生错误',
    maintenanceLabel: '系统维护中:',
  },
}

function getText(lang, key) {
  const pack = I18N[lang] || I18N.en
  return pack[key] || I18N.en[key] || ''
}

export default function LoginApp() {
  const [role, setRole] = useState(() => {
    const p = new URLSearchParams(window.location.search)
    return p.get('role') === 'member' ? 'member' : 'admin'
  })
  const [lang, setLang] = useState('en')
  const [companyId, setCompanyId] = useState('')
  const [userField, setUserField] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [maintenanceRows, setMaintenanceRows] = useState([])
  const [modalOpen, setModalOpen] = useState(false)
  const [modalTitle, setModalTitle] = useState('')
  const [modalMessage, setModalMessage] = useState('')
  const verifyTimeoutRef = useRef(null)

  const bgStyle = useMemo(
    () => ({
      backgroundImage: `url(${appPath('images/count_bg.png')})`,
    }),
    [],
  )

  const showAlert = useCallback(
    (title, message) => {
      setModalTitle(title || getText(lang, 'notice'))
      setModalMessage(message || '')
      setModalOpen(true)
    },
    [lang],
  )

  const closeModal = useCallback(() => {
    setModalOpen(false)
  }, [])

  const verifyCompanyId = useCallback((value) => {
    const v = (value || '').trim()
    if (!v) return
    const formData = new FormData()
    formData.append('company_id', v)
    fetch(appPath('api/company/verify_api.php'), {
      method: 'POST',
      body: formData,
      credentials: 'same-origin',
    }).catch(() => {})
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && modalOpen) closeModal()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [modalOpen, closeModal])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const response = await fetch(appPath('api/maintenance/get_public_api.php'), {
          credentials: 'same-origin',
        })
        const result = await response.json()
        if (cancelled) return
        if (result.success && Array.isArray(result.data) && result.data.length > 0) {
          setMaintenanceRows(result.data)
        } else {
          setMaintenanceRows([])
        }
      } catch {
        if (!cancelled) setMaintenanceRows([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const onCompanyChange = (e) => {
    const upper = e.target.value.toUpperCase()
    setCompanyId(upper)

    if (verifyTimeoutRef.current) clearTimeout(verifyTimeoutRef.current)
    if (upper.trim() === '') return
    verifyTimeoutRef.current = window.setTimeout(() => verifyCompanyId(upper), 500)
  }

  const onCompanyBlur = () => {
    if (verifyTimeoutRef.current) clearTimeout(verifyTimeoutRef.current)
    if (companyId.trim() !== '') verifyCompanyId(companyId)
  }

  const onUserChange = (e) => {
    setUserField(e.target.value.toUpperCase())
  }

  const userPlaceholder =
    role === 'member' ? getText(lang, 'accountId') : getText(lang, 'username')

  const onSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const formData = new FormData()
      formData.append('company_id', companyId.trim())
      formData.append('password', password.trim())
      formData.append('action', 'login')
      formData.append('login_role', role)
      if (role === 'member') {
        formData.append('account_id', userField.trim())
      } else {
        formData.append('login_id', userField.trim())
      }
      if (rememberMe) {
        formData.append('remember_me', '1')
      }

      const response = await fetch(appPath('login_process.php'), {
        method: 'POST',
        body: formData,
        credentials: 'same-origin',
      })
      const data = await response.json()
      if (data.status === 'success' && data.redirect) {
        window.location.href = data.redirect
        return
      }
      showAlert(getText(lang, 'notice'), data.message || getText(lang, 'loginError'))
    } catch {
      showAlert(getText(lang, 'notice'), getText(lang, 'loginError'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-page-root" style={bgStyle}>
      <div className="login-container">
        {maintenanceRows.length > 0 ? (
          <div className="maintenance-marquee-wrapper">
            <div className="maintenance-marquee-track">
              {maintenanceRows.flatMap((m, idx) => [
                <div className="maintenance-marquee-item" key={`${m.id}-${idx}-a`}>
                  <span className="maintenance-marquee-dot" />
                  <span className="maintenance-marquee-label">{getText(lang, 'maintenanceLabel')}</span>
                  <span>{m.content}</span>
                </div>,
                <div className="maintenance-marquee-item" key={`${m.id}-${idx}-b`}>
                  <span className="maintenance-marquee-dot" />
                  <span className="maintenance-marquee-label">{getText(lang, 'maintenanceLabel')}</span>
                  <span>{m.content}</span>
                </div>,
              ])}
            </div>
          </div>
        ) : null}

        <div className="role-tabs">
          <button
            type="button"
            className={`role-tab${role === 'admin' ? ' active' : ''}`}
            onClick={() => setRole('admin')}
          >
            {getText(lang, 'admin')}
          </button>
          <button
            type="button"
            className={`role-tab${role === 'member' ? ' active' : ''}`}
            onClick={() => setRole('member')}
          >
            {getText(lang, 'member')}
          </button>
        </div>

        <div className="login-card">
          <div className="form-content">
            <form className="login-form" onSubmit={onSubmit}>
              <div className="input-group">
                <i className="fas fa-building input-icon" aria-hidden />
                <input
                  type="text"
                  name="company_id"
                  placeholder={getText(lang, 'companyId')}
                  value={companyId}
                  onChange={onCompanyChange}
                  onBlur={onCompanyBlur}
                  required
                  autoComplete="organization"
                />
              </div>

              <div className="input-group">
                <i className="fas fa-user input-icon" aria-hidden />
                <input
                  type="text"
                  name={role === 'member' ? 'account_id' : 'login_id'}
                  placeholder={userPlaceholder}
                  value={userField}
                  onChange={onUserChange}
                  required
                  autoComplete="username"
                />
              </div>

              <div className="input-group">
                <i className="fas fa-lock input-icon" aria-hidden />
                <input
                  type="password"
                  name="password"
                  placeholder={getText(lang, 'password')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>

              <div className={`form-options${role === 'member' ? ' member-mode' : ''}`}>
                <label className="remember-switch">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  <span className="slider" />
                  <span className="remember-text">{getText(lang, 'rememberMe')}</span>
                </label>
                {role === 'admin' ? (
                  <a className="forgot-link" href={appPath('reset-password.php')}>
                    {getText(lang, 'forgetPassword')}
                  </a>
                ) : null}
              </div>

              <button type="submit" className="login-btn" disabled={submitting}>
                {getText(lang, 'login')}
              </button>

              <div className="language-switch-container" aria-label="Language switch">
                <button
                  type="button"
                  className={`lang-btn${lang === 'en' ? ' active' : ''}`}
                  onClick={() => setLang('en')}
                  aria-label="English"
                >
                  <span className="lang-label">English</span>
                </button>
                <button
                  type="button"
                  className={`lang-btn${lang === 'zh' ? ' active' : ''}`}
                  onClick={() => setLang('zh')}
                  aria-label="中文"
                >
                  <span className="lang-label">中文</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <img src={appPath('images/telegram.png')} alt="Telegram" className="telegram-icon" />

      <div
        className={`modal-overlay${modalOpen ? ' is-open' : ''}`}
        aria-hidden={!modalOpen}
        onClick={(ev) => {
          if (ev.target === ev.currentTarget) closeModal()
        }}
      >
        <div className="modal-box" role="dialog" aria-labelledby="modalTitle" aria-describedby="modalMessage">
          <div className="modal-icon-wrap">
            <i className="fas fa-exclamation-triangle modal-icon" aria-hidden />
          </div>
          <h3 id="modalTitle" className="modal-title">
            {modalTitle || getText(lang, 'notice')}
          </h3>
          <p id="modalMessage" className="modal-message">
            {modalMessage}
          </p>
          <div className="modal-actions">
            <button type="button" className="modal-btn modal-btn-primary" onClick={closeModal}>
              {getText(lang, 'confirm')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
