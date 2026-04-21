import { useMemo, useState } from 'react'
import './Sidebar.css'

const MENU_ITEMS = [
  { key: 'home', label: 'Home', href: '#/dashboard' },
  { key: 'domain', label: 'Domain', href: '#/domain' },
  { key: 'announcement', label: 'Announcement', href: '#/announcement' },
  { key: 'admin', label: 'Admin', href: '#/admin' },
  { key: 'account', label: 'Account', href: '#/account' },
  { key: 'ownership', label: 'Ownership', href: '#/ownership' },
  { key: 'process', label: 'Process', href: '#/process' },
  { key: 'datacapture', label: 'Data Capture', href: '#/datacapture' },
  { key: 'payment', label: 'Transaction Payment', href: '#/payment' }
]

const REPORT_ITEMS = [
  { key: 'customer_report', label: 'Customer Report', href: '#/customer_report' },
  { key: 'domain_report', label: 'Domain Report', href: '#/domain_report' }
]

const MAINTENANCE_ITEMS = [
  { key: 'capture_maintenance', label: 'Data Capture', href: '#/capture_maintenance' },
  { key: 'transaction_maintenance', label: 'Transaction', href: '#/transaction_maintenance' },
  { key: 'payment_maintenance', label: 'Payment', href: '#/payment_maintenance' },
  { key: 'formula_maintenance', label: 'Formula', href: '#/formula_maintenance' },
  { key: 'bankprocess_maintenance', label: 'Process', href: '#/bankprocess_maintenance' }
]

function Sidebar({ currentRoute = '#/' }) {
  const [openReport, setOpenReport] = useState(false)
  const [openMaintenance, setOpenMaintenance] = useState(false)

  const isMenuActive = (href) => {
    return currentRoute === href
  }
  const isSubmenuActive = (items) => items.some((item) => isMenuActive(item.href))

  return (
    <aside className='informationmenu' aria-label='Sidebar'>
      <div className='informationmenu-header'>
        <div className='header-logo-section'>
          <img src='/images/count_whitelogo.png' alt='EAZYCOUNT Logo' className='header-logo' />
        </div>
      </div>

      <div className='informationmenu-content'>
        <div className='content-separator' />

        {MENU_ITEMS.map((item) => (
          <div className='informationmenu-section' key={item.key}>
            <a
              className={`informationmenu-section-title ${isMenuActive(item.href) ? 'current-page' : ''}`}
              href={item.href}
            >
              {item.label}
            </a>
          </div>
        ))}

        <div className='informationmenu-section'>
          <button
            type='button'
            className={`informationmenu-section-title sidebar-toggle-btn ${isSubmenuActive(REPORT_ITEMS) ? 'current-page' : ''}`}
            onClick={() => setOpenReport((v) => !v)}
          >
            Report
            <span className={`section-arrow ${openReport ? 'open' : ''}`}>▶</span>
          </button>
          {openReport && (
            <div className='submenu-content'>
              {REPORT_ITEMS.map((item) => (
                <a
                  key={item.key}
                  className={`submenu-item ${isMenuActive(item.href) ? 'current-page' : ''}`}
                  href={item.href}
                >
                  {item.label}
                </a>
              ))}
            </div>
          )}
        </div>

        <div className='informationmenu-section'>
          <button
            type='button'
            className={`informationmenu-section-title sidebar-toggle-btn ${isSubmenuActive(MAINTENANCE_ITEMS) ? 'current-page' : ''}`}
            onClick={() => setOpenMaintenance((v) => !v)}
          >
            Maintenance
            <span className={`section-arrow ${openMaintenance ? 'open' : ''}`}>▶</span>
          </button>
          {openMaintenance && (
            <div className='submenu-content'>
              {MAINTENANCE_ITEMS.map((item) => (
                <a
                  key={item.key}
                  className={`submenu-item ${isMenuActive(item.href) ? 'current-page' : ''}`}
                  href={item.href}
                >
                  {item.label}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className='informationmenu-footer'>
        <a className='logout-btn' href='#/logout'>
          Logout
        </a>
      </div>
    </aside>
  )
}

export default Sidebar
