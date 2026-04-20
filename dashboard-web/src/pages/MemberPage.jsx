import { useEffect, useMemo, useRef } from 'react'

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = src
    s.async = false
    s.onload = () => resolve()
    s.onerror = () => reject(new Error(`Failed to load ${src}`))
    document.body.appendChild(s)
  })
}

function readBootstrap() {
  const b = typeof window !== 'undefined' && window.__MEMBER_BOOTSTRAP ? window.__MEMBER_BOOTSTRAP : null
  if (b && typeof b === 'object') return b
  return {
    defaultDateFrom: '01/01/2024',
    defaultDateTo: '01/01/2024',
    captureDateRangeDisplay: '01/01/2024 - 01/01/2024',
    memberCompanies: [],
    currentCompanyId: 0,
    showCompanyFilter: false,
    showDebug: false,
    debugInfo: {}
  }
}

export default function MemberPage() {
  const boot = useMemo(() => readBootstrap(), [])
  const legacyStarted = useRef(false)

  useEffect(() => {
    if (legacyStarted.current) return
    legacyStarted.current = true

    const ver =
      typeof window.__MEMBER_JS_VER !== 'undefined' && window.__MEMBER_JS_VER != null
        ? String(window.__MEMBER_JS_VER)
        : String(Date.now())
    const base = typeof window.__COUNT_ASSET_BASE === 'string' ? window.__COUNT_ASSET_BASE : ''

    const run = async () => {
      if (typeof window.flatpickr === 'undefined') {
        await loadScript('https://cdn.jsdelivr.net/npm/flatpickr')
      }
      await loadScript(`${base}js/member.js?v=${encodeURIComponent(ver)}`)
    }
    run().catch((e) => console.error(e))
  }, [])

  const d = boot.debugInfo || {}

  return (
    <div className="transaction-container">
      <h1 className="transaction-title">Win/Loss</h1>
      <div className="transaction-separator-line" />

      <div className="transaction-main-content">
        <div className="transaction-search-section" style={{ flex: 1 }}>
          <div className="transaction-form-group transaction-capture-date-group">
            <label className="transaction-label transaction-date-range-label">Capture Date</label>
            <div className="transaction-capture-date-row">
              <div className="transaction-date-range-wrap" id="capture_date_range_wrap">
                <i className="fas fa-calendar-alt" aria-hidden="true" />
                <input
                  type="text"
                  id="capture_date_range"
                  className="transaction-input transaction-date-range-input"
                  defaultValue={boot.captureDateRangeDisplay}
                  placeholder="Select date range"
                  readOnly
                  style={{ cursor: 'pointer' }}
                />
              </div>
              <div className="transaction-quick-select-wrap">
                <div className="dropdown transaction-quick-select-dropdown">
                  <button
                    type="button"
                    className="btn btn-secondary dropdown-toggle transaction-quick-select-btn"
                    onClick={() => window.toggleQuickSelectDropdown?.()}
                  >
                    <i className="fas fa-calendar-alt" />
                    <span id="quick-select-text">Period</span>
                    <i className="fas fa-chevron-down" />
                  </button>
                  <div className="dropdown-menu" id="quick-select-dropdown">
                    <button type="button" className="dropdown-item" onClick={() => window.selectQuickRange?.('today')}>
                      Today
                    </button>
                    <button type="button" className="dropdown-item" onClick={() => window.selectQuickRange?.('yesterday')}>
                      Yesterday
                    </button>
                    <button type="button" className="dropdown-item" onClick={() => window.selectQuickRange?.('thisWeek')}>
                      This Week
                    </button>
                    <button type="button" className="dropdown-item" onClick={() => window.selectQuickRange?.('lastWeek')}>
                      Last Week
                    </button>
                    <button type="button" className="dropdown-item" onClick={() => window.selectQuickRange?.('thisMonth')}>
                      This Month
                    </button>
                    <button type="button" className="dropdown-item" onClick={() => window.selectQuickRange?.('lastMonth')}>
                      Last Month
                    </button>
                    <button type="button" className="dropdown-item" onClick={() => window.selectQuickRange?.('thisYear')}>
                      This Year
                    </button>
                    <button type="button" className="dropdown-item" onClick={() => window.selectQuickRange?.('lastYear')}>
                      Last Year
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <input type="hidden" id="date_from" defaultValue={boot.defaultDateFrom} />
            <input type="hidden" id="date_to" defaultValue={boot.defaultDateTo} />
          </div>

          {boot.showCompanyFilter && Array.isArray(boot.memberCompanies) && boot.memberCompanies.length > 1 ? (
            <div className="member-company-filter" id="member_company_filter" style={{ display: 'flex', visibility: 'visible' }}>
              <span className="transaction-company-label">Company:</span>
              <div id="member_company_buttons" className="transaction-company-buttons member-currency-buttons">
                {boot.memberCompanies.map((company) => {
                  const c = company && typeof company === 'object' ? company : {}
                  const compId = parseInt(c.id, 10) || 0
                  if (compId <= 0) return null
                  const compCode = String(c.company_id ?? '').toUpperCase()
                  const compName = String(c.company_name ?? compCode)
                  const label = compCode || compName
                  const isActive = compId === parseInt(boot.currentCompanyId, 10)
                  return (
                    <button
                      key={compId}
                      type="button"
                      className={`transaction-company-btn${isActive ? ' active' : ''}`}
                      data-company-id={compId}
                      data-company-label={label}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}

          {boot.showDebug ? (
            <div className="member-alert member-alert-error" style={{ display: 'block', marginTop: '12px' }}>
              <strong>Debug Info:</strong>{' '}
              {!boot.memberCompanies || boot.memberCompanies.length === 0
                ? 'No associated companies found.'
                : 'Company data integrity warning.'}
              <br />
              User ID: {String(d.user_id ?? 'N/A')}, User Type: {String(d.user_type ?? 'N/A')}, Account Company Records:{' '}
              {String(d.account_company_count ?? '0')}
              {d.stored_company_ids && Array.isArray(d.stored_company_ids) && d.stored_company_ids.length > 0 ? (
                <>
                  <br />
                  Stored Company IDs: {d.stored_company_ids.join(', ')}
                </>
              ) : null}
              {d.existing_company_ids && Array.isArray(d.existing_company_ids) && d.existing_company_ids.length > 0 ? (
                <>
                  <br />
                  Existing Company IDs: {d.existing_company_ids.join(', ')}
                </>
              ) : null}
              {d.missing_company_ids && Array.isArray(d.missing_company_ids) && d.missing_company_ids.length > 0 ? (
                <>
                  <br />
                  <strong style={{ color: 'red' }}>Missing Company IDs: {d.missing_company_ids.join(', ')}</strong>
                </>
              ) : null}
              {d.companies_found != null ? (
                <>
                  <br />
                  Companies Found: {String(d.companies_found)}
                </>
              ) : null}
              {d.used_direct_query ? (
                <>
                  <br />
                  <strong style={{ color: 'orange' }}>Used direct query (skipped JOIN)</strong>
                </>
              ) : null}
              {d.error ? (
                <>
                  <br />
                  <strong>Error:</strong> {String(d.error)}
                </>
              ) : null}
            </div>
          ) : null}

          <div className="member-account-filter transaction-company-filter" id="member_account_filter" style={{ display: 'none' }}>
            <span className="transaction-company-label">Account:</span>
            <div id="member_account_buttons" className="transaction-company-buttons member-currency-buttons">
              <span className="member-account-loading" id="member_account_loading">
                Loading...
              </span>
            </div>
          </div>
          <div
            className="transaction-company-filter member-currency-filter"
            id="member_currency_filter"
            style={{ display: 'flex', visibility: 'visible' }}
          >
            <span className="transaction-company-label">Currency:</span>
            <div id="member_currency_buttons" className="transaction-company-buttons member-currency-buttons" />
          </div>
        </div>
      </div>

      <div className="member-currency-section" id="member_currency_tables_section" style={{ display: 'flex', visibility: 'visible' }}>
        <div id="member_currency_tables" className="member-currency-tables">
          <p className="member-currency-empty" style={{ margin: 0 }}>
            Loading...
          </p>
        </div>
      </div>

      <div id="notificationContainer" className="transaction-notification-container" />
    </div>
  )
}
