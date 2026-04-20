import { useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { applySidebarGlobals } from '../lib/applySidebarGlobals.js'

const MALE_IDS = ['male1', 'male2', 'male3', 'male4', 'male5', 'male6', 'male7', 'male8', 'male9']
const FEMALE_IDS = ['female1', 'female2', 'female3', 'female4', 'female5', 'female6', 'female7', 'female8', 'female9']

const PARTNER_HIDE = new Set(['admin', 'account', 'process', 'datacapture', 'payment', 'maintenance'])

function canPerm(permissions, key) {
  return !permissions?.length || permissions.includes(key)
}

function useSidebarBootstrap() {
  return useMemo(() => {
    const w = typeof window !== 'undefined' ? window.__SIDEBAR_BOOTSTRAP : null
    return w && typeof w === 'object'
      ? w
      : {
          isMember: false,
          login_id: '',
          name: '',
          role: '',
          permissions: [],
          hasC168Access: false,
          companyId: null,
          currentCompanyCode: '',
          avatarId: 'male1',
          initialAvatarSrc: 'images/avatar1.png',
          company_expiration_date: null,
          expiration_countdown_text: '',
          expiration_status: 'normal',
          companyHasGambling: false,
          companyHasBank: false,
          hasMaintenance: false,
          isExternalView: false
        }
  }, [])
}

export default function Sidebar() {
  const b = useSidebarBootstrap()
  const navigate = useNavigate()

  const goSpa = (path) => () => {
    navigate(path)
    window.closeSidebar?.()
  }

  const goPhp = (href) => () => {
    window.location.href = href
  }

  useEffect(() => {
    applySidebarGlobals(b)
    if (typeof window.updateExpirationCountdown === 'function' && window.SIDEBAR_EXPIRATION_DATE) {
      window.updateExpirationCountdown()
      const t = setInterval(() => window.updateExpirationCountdown?.(), 60000)
      return () => clearInterval(t)
    }
    return undefined
  }, [b])

  useEffect(() => {
    if (typeof window.updateSidebarDataCaptureVisibility === 'function') {
      window.updateSidebarDataCaptureVisibility(!!b.companyHasGambling, !!b.companyHasBank)
    }
  }, [b.companyHasGambling, b.companyHasBank])

  useEffect(() => {
    if (!b.isExternalView) return undefined
    const hideCategories = ['Admin', 'Account', 'Process', 'Data Capture', 'Transaction Payment', 'Maintenance']
    const run = () => {
      document.querySelectorAll('.informationmenu-menu a.informationmenu-btn, .informationmenu-menu div.informationmenu-btn').forEach((btn) => {
        const textSpan = btn.querySelector('.btn-text')
        if (textSpan && hideCategories.includes(textSpan.textContent.trim())) {
          btn.style.display = 'none'
        }
      })
    }
    run()
    const observeDOM = new MutationObserver(run)
    observeDOM.observe(document.body, { childList: true, subtree: true })
    const obs2 = new MutationObserver(() => {
      document
        .querySelectorAll(
          'button:not(.fc-button):not([data-readonly-processed]), input[type="submit"]:not([data-readonly-processed]), input[type="button"]:not([data-readonly-processed])'
        )
        .forEach((el) => {
          const t = (el.textContent || '').toLowerCase() + (el.value || '').toLowerCase()
          if (
            t.includes('add') ||
            t.includes('save') ||
            t.includes('delete') ||
            t.includes('update') ||
            t.includes('confirm') ||
            t.includes('upload') ||
            el.querySelector('svg:not(.view-icon)')
          ) {
            el.style.pointerEvents = 'none'
            el.style.opacity = '0.4'
            el.title = 'Read-Only Partner Mode'
            el.setAttribute('data-readonly-processed', 'true')
          }
        })
    })
    obs2.observe(document.body, { childList: true, subtree: true })
    return () => {
      observeDOM.disconnect()
      obs2.disconnect()
    }
  }, [b.isExternalView])

  const showNav = (key) => {
    if (!b.isExternalView) return true
    return !PARTNER_HIDE.has(key)
  }

  const av = b.avatarImages || {}

  if (b.isMember) {
    return (
      <>
        <div className="informationmenu-overlay" />
        <div className="informationmenu">
          <div className="informationmenu-header">
            <div className="header-logo-section">
              <img src="images/count_whitelogo.png" alt="EAZYCOUNT Logo" className="header-logo" />
              <button
                type="button"
                className="notification-bell"
                title="Notifications"
                onClick={(e) => window.toggleNotificationPanel?.(e)}
              >
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 2C10.34 2 9 3.34 9 5V5.29C6.72 6.15 5.12 8.39 5.01 11L5 11V16L3 18V19H21V18L19 16V11C18.88 8.39 17.28 6.15 15 5.29V5C15 3.34 13.66 2 12 2ZM12 22C10.9 22 10 21.1 10 20H14C14 21.1 13.1 22 12 22Z" />
                </svg>
              </button>
            </div>
            <div className="user-info-container">
              <div className="avatar-selector-container">
                <div className="current-avatar" id="currentAvatar" onClick={() => window.toggleAvatarOptions?.()} role="presentation">
                  <img
                    id="currentAvatarImg"
                    className="current-avatar-img"
                    src={b.initialAvatarSrc}
                    data-avatar-id={b.avatarId}
                    alt="Avatar"
                    fetchpriority="high"
                    loading="eager"
                  />
                </div>
                <div className="avatar-options" id="avatarOptions">
                  <div className="options-title">Choose Avatar</div>
                  <div className="gender-selection" id="genderSelection">
                    <button type="button" className="gender-btn active" onClick={() => window.selectGender?.('male')}>
                      Male
                    </button>
                    <button type="button" className="gender-btn" onClick={() => window.selectGender?.('female')}>
                      Female
                    </button>
                  </div>
                  <div className="avatar-list show" id="maleAvatarList">
                    {MALE_IDS.map((id) => (
                      <div key={id} className="avatar-option" data-avatar-id={id} onClick={() => window.selectAvatar?.(id)} role="presentation">
                        <img src={av[id]} alt="" className="avatar-option-img" />
                      </div>
                    ))}
                  </div>
                  <div className="avatar-list" id="femaleAvatarList">
                    {FEMALE_IDS.map((id) => (
                      <div key={id} className="avatar-option" data-avatar-id={id} onClick={() => window.selectAvatar?.(id)} role="presentation">
                        <img src={av[id]} alt="" className="avatar-option-img" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="user-avatar-dropdown">
                <div className="user-info">
                  <div className="user-name">{b.login_id}</div>
                  <div className="user-role">{b.role ? b.role.charAt(0).toUpperCase() + b.role.slice(1) : ''}</div>
                </div>
              </div>
            </div>
          </div>
          <div className="informationmenu-content">
            <div className="content-separator" />
            <div className="informationmenu-section">
              <div
                className="informationmenu-section-title account-direct"
                data-page="member.php"
                onClick={goSpa('/member')}
                onKeyDown={(e) => e.key === 'Enter' && goSpa('/member')()}
                role="button"
                tabIndex={0}
              >
                <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z" />
                </svg>
                Win/Loss
              </div>
            </div>
          </div>
          <div className="informationmenu-footer">
            {b.company_expiration_date ? (
              <div className={`company-expiration-countdown ${b.expiration_status}`} id="companyExpirationCountdown">
                <svg className="expiration-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <div className="expiration-content">
                  <span className="expiration-label">Exp:</span>
                  <span className={`expiration-countdown-text ${b.expiration_status}`} id="expirationCountdownText">
                    {b.expiration_countdown_text}
                  </span>
                </div>
              </div>
            ) : null}
            <button type="button" className="btn logout-btn" onClick={() => window.handleLogout?.()}>
              Logout
            </button>
          </div>
        </div>
        <div className="notification-overlay" id="notificationOverlay" onClick={() => window.closeNotificationPanel?.()} role="presentation" />
        <div className="notification-panel" id="notificationPanel">
          <div className="notification-header">
            <h2>Announcements</h2>
            <button type="button" className="notification-close" onClick={() => window.closeNotificationPanel?.()} title="关闭">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div className="notification-content" id="notificationContent" />
        </div>
      </>
    )
  }

  const p = b.permissions || []

  return (
    <>
      <div className="informationmenu-overlay" />
      <div className="informationmenu">
        <div className="informationmenu-header">
          <div className="header-logo-section">
            <img src="images/count_whitelogo.png" alt="EAZYCOUNT Logo" className="header-logo" />
            <button type="button" className="notification-bell" title="Notifications" onClick={(e) => window.toggleNotificationPanel?.(e)}>
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 2C10.34 2 9 3.34 9 5V5.29C6.72 6.15 5.12 8.39 5.01 11L5 11V16L3 18V19H21V18L19 16V11C18.88 8.39 17.28 6.15 15 5.29V5C15 3.34 13.66 2 12 2ZM12 22C10.9 22 10 21.1 10 20H14C14 21.1 13.1 22 12 22Z" />
              </svg>
            </button>
          </div>
          <div className="user-info-container">
            <div className="avatar-selector-container">
              <div className="current-avatar" id="currentAvatar" onClick={() => window.toggleAvatarOptions?.()} role="presentation">
                <img
                  id="currentAvatarImg"
                  className="current-avatar-img"
                  src={b.initialAvatarSrc}
                  data-avatar-id={b.avatarId}
                  alt="Avatar"
                  fetchpriority="high"
                  loading="eager"
                />
              </div>
              <div className="avatar-options" id="avatarOptions">
                <div className="options-title">Choose Avatar</div>
                <div className="gender-selection" id="genderSelection">
                  <button type="button" className="gender-btn active" onClick={() => window.selectGender?.('male')}>
                    Male
                  </button>
                  <button type="button" className="gender-btn" onClick={() => window.selectGender?.('female')}>
                    Female
                  </button>
                </div>
                <div className="avatar-list show" id="maleAvatarList">
                  {MALE_IDS.map((id) => (
                    <div key={id} className="avatar-option" data-avatar-id={id} onClick={() => window.selectAvatar?.(id)} role="presentation">
                      <img src={av[id]} alt="" className="avatar-option-img" />
                    </div>
                  ))}
                </div>
                <div className="avatar-list" id="femaleAvatarList">
                  {FEMALE_IDS.map((id) => (
                    <div key={id} className="avatar-option" data-avatar-id={id} onClick={() => window.selectAvatar?.(id)} role="presentation">
                      <img src={av[id]} alt="" className="avatar-option-img" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="user-avatar-dropdown">
              <div className="user-info">
                <div className="user-name">{b.login_id}</div>
                <div className="user-role">{b.role ? b.role.charAt(0).toUpperCase() + b.role.slice(1) : ''}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="informationmenu-content">
          <div className="content-separator" />

          {canPerm(p, 'home') && showNav('home') ? (
            <div className="informationmenu-section">
              <div
                className="informationmenu-section-title"
                data-page="dashboard.php"
                onClick={goSpa('/dashboard')}
                role="button"
                tabIndex={0}
              >
                <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
                </svg>
                Home
              </div>
            </div>
          ) : null}

          {canPerm(p, 'domain') && b.hasC168Access && showNav('domain') ? (
            <div className="informationmenu-section">
              <div className="informationmenu-section-title" data-page="domain.php" onClick={goPhp('domain.php')} role="button" tabIndex={0}>
                <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm6.93 8h-3.46c-.14-2.01-.5-3.88-1.06-5.38 2.16.76 3.76 2.62 4.52 5.38zm-6.93 0h-4.9c.13-1.78.58-3.51 1.28-4.9.53-1.04 1.16-1.79 1.78-2.21.6-.41.98-.46 1.84-.46v7.57zm0 2v7.57c-.86 0-1.24-.05-1.84-.46-.62-.43-1.25-1.17-1.78-2.21-.7-1.39-1.15-3.12-1.28-4.9h4.9zm2 7.43V12h4.9c-.13 1.78-.58 3.51-1.28 4.9-.53 1.04-1.16 1.79-1.78 2.21-.6.41-.98.46-1.84.46zm0-9.43V4.43c.86 0 1.24.05 1.84.46.62.43 1.25 1.17 1.78 2.21.7 1.39 1.15 3.12 1.28 4.9h-4.9zM5.07 12h3.46c.14 2.01.5 3.88 1.06 5.38-2.16-.76-3.76-2.62-4.52-5.38z" />
                </svg>
                Domain
              </div>
            </div>
          ) : null}

          {b.hasC168Access ? (
            <div className="informationmenu-section">
              <div
                className="informationmenu-section-title account-direct"
                data-page="announcement.php"
                onClick={goPhp('announcement.php')}
                role="button"
                tabIndex={0}
              >
                <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" />
                </svg>
                Announcement
              </div>
            </div>
          ) : null}

          {canPerm(p, 'admin') && showNav('admin') ? (
            <div className="informationmenu-section">
              <div className="informationmenu-section-title account-direct" data-page="userlist.php" onClick={goPhp('userlist.php')} role="button" tabIndex={0}>
                <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
                </svg>
                Admin
              </div>
            </div>
          ) : null}

          {canPerm(p, 'account') && showNav('account') ? (
            <>
              <div className="informationmenu-section">
                <div
                  className="informationmenu-section-title account-direct"
                  data-page="account-list.php"
                  onClick={goPhp('account-list.php')}
                  role="button"
                  tabIndex={0}
                >
                  <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                  </svg>
                  Account
                </div>
              </div>
              <div className="informationmenu-section">
                <div className="informationmenu-section-title account-direct" data-page="ownership.php" onClick={goPhp('ownership.php')} role="button" tabIndex={0}>
                  <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
                  </svg>
                  Ownership
                </div>
              </div>
            </>
          ) : null}

          {canPerm(p, 'process') && showNav('process') ? (
            <div className="informationmenu-section">
              <div className="informationmenu-section-title" data-page="processlist.php" onClick={goPhp('processlist.php')} role="button" tabIndex={0}>
                <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                </svg>
                Process
              </div>
            </div>
          ) : null}

          {canPerm(p, 'datacapture') && showNav('datacapture') ? (
            <div className="informationmenu-section" id="sidebar-datacapture-section" style={{ display: b.companyHasGambling ? undefined : 'none' }}>
              <div className="informationmenu-section-title" data-page="datacapture.php" onClick={goPhp('datacapture.php')} role="button" tabIndex={0}>
                <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z" />
                </svg>
                Data Capture
              </div>
            </div>
          ) : null}

          {canPerm(p, 'payment') && showNav('payment') ? (
            <div className="informationmenu-section">
              <div className="informationmenu-section-title" data-page="transaction.php" onClick={goPhp('transaction.php')} role="button" tabIndex={0}>
                <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z" />
                </svg>
                Transaction Payment
              </div>
            </div>
          ) : null}

          {canPerm(p, 'report') ? (
            <div className="informationmenu-section" id="sidebar-report-section" style={{ display: b.companyHasGambling ? undefined : 'none' }}>
              <div className="menu-item-wrapper">
                <div className="informationmenu-section-title" data-section="report">
                  <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 2 2h8c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" />
                  </svg>
                  Report
                  <span className="section-arrow">▶</span>
                </div>
                <div className="submenu" id="report-submenu">
                  <div className="submenu-content">
                    <a href="customer_report.php" className="submenu-item">
                      <span>Customer Report</span>
                    </a>
                    <a href="domain_report.php" className="submenu-item">
                      <span>Domain Report</span>
                    </a>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {showNav('maintenance') ? (
            <div className="informationmenu-section">
              <div className="menu-item-wrapper">
                <div className="informationmenu-section-title" data-section="maintenance">
                  <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z" />
                  </svg>
                  Maintenance
                  <span className="section-arrow">▶</span>
                </div>
                <div className="submenu" id="maintenance-submenu">
                  <div className="submenu-content">
                    {b.companyHasGambling && b.hasMaintenance ? (
                      <a href="capture_maintenance.php" className="submenu-item" id="maintenance-capture-link">
                        <span>Data Capture</span>
                      </a>
                    ) : null}
                    {b.companyHasGambling && b.hasMaintenance ? (
                      <a href="transaction_maintenance.php" className="submenu-item" id="maintenance-transaction-link">
                        <span>Transaction</span>
                      </a>
                    ) : null}
                    {b.hasMaintenance ? (
                      <a href="payment_maintenance.php" className="submenu-item">
                        <span>Payment</span>
                      </a>
                    ) : null}
                    {b.companyHasGambling ? (
                      <a href="formula_maintenance.php" className="submenu-item" id="maintenance-formula-link">
                        <span>Formula</span>
                      </a>
                    ) : null}
                    {b.hasMaintenance ? (
                      <a
                        href="bankprocess_maintenance.php"
                        className="submenu-item"
                        id="maintenance-process-link"
                        style={{ display: b.companyHasBank ? undefined : 'none' }}
                      >
                        <span>Process</span>
                      </a>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="informationmenu-footer">
          {b.company_expiration_date ? (
            <div className={`company-expiration-countdown ${b.expiration_status}`} id="companyExpirationCountdown">
              <svg className="expiration-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <div className="expiration-content">
                <span className="expiration-label">Exp:</span>
                <span className={`expiration-countdown-text ${b.expiration_status}`} id="expirationCountdownText">
                  {b.expiration_countdown_text}
                </span>
              </div>
            </div>
          ) : null}
          <button type="button" className="btn logout-btn" onClick={() => window.handleLogout?.()}>
            Logout
          </button>
        </div>
      </div>

      <div className="notification-overlay" id="notificationOverlay" onClick={() => window.closeNotificationPanel?.()} role="presentation" />
      <div className="notification-panel" id="notificationPanel">
        <div className="notification-header">
          <h2>Announcements</h2>
          <button type="button" className="notification-close" onClick={() => window.closeNotificationPanel?.()} title="关闭">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="notification-content" id="notificationContent" />
      </div>
    </>
  )
}
