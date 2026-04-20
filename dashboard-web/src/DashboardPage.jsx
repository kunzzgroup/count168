import { useEffect } from 'react'

function loadDashboardScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = src
    s.async = false
    s.setAttribute('data-dashboard-legacy', '1')
    s.onload = () => resolve()
    s.onerror = () => reject(new Error(`Failed to load ${src}`))
    document.body.appendChild(s)
  })
}

function runDashboardBootstrap() {
  if (typeof window.__dashboardLegacyBootstrap === 'function') {
    window.__dashboardLegacyBootstrap()
  }
}

export default function DashboardPage() {
  useEffect(() => {
    // 必须在加载 dashboard.js 之前设置，否则脚本末尾会自行 init 一次（与 React 重复）
    window.__DASHBOARD_SPA_DEFER_INIT = true

    const ver =
      typeof window.__DASHBOARD_JS_VER !== 'undefined' && window.__DASHBOARD_JS_VER !== null
        ? String(window.__DASHBOARD_JS_VER)
        : String(Date.now())
    const base = typeof window.__COUNT_ASSET_BASE === 'string' ? window.__COUNT_ASSET_BASE : ''
    const url = `${base}js/dashboard.js?v=${encodeURIComponent(ver)}`

    const existing = document.querySelector('script[data-dashboard-legacy="1"]')
    if (existing) {
      if (window.__dashboardLegacyBootstrap) {
        runDashboardBootstrap()
      } else {
        existing.addEventListener('load', runDashboardBootstrap, { once: true })
      }
      return undefined
    }

    loadDashboardScript(url)
      .then(runDashboardBootstrap)
      .catch((e) => {
        console.error(e)
      })
    return undefined
  }, [])

  return (
    <>
      <div className="dashboard-container">
        <h1 className="dashboard-title">Transaction Dashboard</h1>

        <div id="app" className="dashboard-content">
          <div className="dashboard-top-row">
            <div className="dashboard-card dashboard-card--filters">
              <div className="dashboard-card-body">
                <div className="dashboard-date-controls">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label className="form-label" style={{ margin: 0 }}>
                      Date Range
                    </label>
                    <div className="date-range-picker" id="date-range-picker" onClick={() => window.toggleCalendar?.()}>
                      <i className="fas fa-calendar-alt" />
                      <span id="date-range-display">Select date range</span>
                    </div>
                  </div>

                  <div className="divider" />

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label
                      className="form-label"
                      style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                      <i className="fas fa-calendar" style={{ color: '#3b82f6' }} />
                      Select Year & Month
                    </label>
                    <div className="enhanced-date-picker month-only" id="month-date-picker">
                      <div
                        className="date-part"
                        data-type="year"
                        onClick={() => window.showDateDropdown?.('month', 'year')}
                      >
                        <span id="month-year-display">--</span>
                      </div>
                      <span className="date-separator">Year</span>
                      <div
                        className="date-part"
                        data-type="month"
                        onClick={() => window.showDateDropdown?.('month', 'month')}
                      >
                        <span id="month-month-display">--</span>
                      </div>
                      <span className="date-separator">Month</span>

                      <div className="date-dropdown" id="month-dropdown" />
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(0px, 0.21vw, 4px)' }}>
                    <label
                      className="form-label"
                      style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                      <i className="fas fa-clock" style={{ color: '#3b82f6' }} />
                      Quick Select
                    </label>
                    <div className="dropdown">
                      <button
                        type="button"
                        className="btn btn-secondary dropdown-toggle"
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

                <div id="group-buttons-wrapper" className="transaction-company-filter" style={{ display: 'none' }}>
                  <span className="transaction-company-label">GroupID:</span>
                  <div id="group-buttons-container" className="transaction-company-buttons" />
                </div>
                <div id="company-buttons-wrapper" className="transaction-company-filter" style={{ display: 'none' }}>
                  <span className="transaction-company-label">Company:</span>
                  <div id="company-buttons-container" className="transaction-company-buttons" />
                </div>
                <div id="currency-buttons-wrapper" className="transaction-company-filter" style={{ display: 'none' }}>
                  <span className="transaction-company-label">Currency:</span>
                  <div id="currency-buttons-container" className="transaction-company-buttons" />
                </div>
              </div>
            </div>

            <div className="dashboard-kpi-card dashboard-kpi-card--blue" id="earnings-card-wrapper" style={{ display: 'none' }}>
              <div className="kpi-icon">
                <i className="fas fa-hand-holding-usd" />
              </div>
              <div className="kpi-text">
                <div className="kpi-label">Earnings</div>
                <div className="kpi-value" id="earnings-value">
                  0
                </div>
              </div>
            </div>
          </div>

          <div className="dashboard-kpi-grid">
            <div className="dashboard-kpi-card dashboard-kpi-card--blue">
              <div className="kpi-icon">
                <i className="fas fa-wallet" />
              </div>
              <div className="kpi-text">
                <div className="kpi-label">Profit</div>
                <div className="kpi-value" id="capital-value">
                  0
                </div>
              </div>
            </div>

            <div className="dashboard-kpi-card dashboard-kpi-card--red">
              <div className="kpi-icon">
                <i className="fas fa-arrow-down" />
              </div>
              <div className="kpi-text">
                <div className="kpi-label">Expenses</div>
                <div className="kpi-value" id="expenses-value">
                  0
                </div>
              </div>
            </div>

            <div className="dashboard-kpi-card dashboard-kpi-card--green">
              <div className="kpi-icon">
                <i className="fas fa-chart-line" />
              </div>
              <div className="kpi-text">
                <div className="kpi-label">NET PROFIT</div>
                <div className="kpi-value" id="profit-value">
                  0
                </div>
              </div>
            </div>
          </div>

          <div className="dashboard-chart-section">
            <div
              className="dashboard-chart-header"
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}
            >
              <div>
                <div className="dashboard-chart-title">Trend Chart</div>
                <div
                  className="dashboard-date-info"
                  id="chart-date-range"
                  style={{ marginTop: '4px', marginBottom: 0, border: 'none', padding: 0, background: 'transparent' }}
                >
                  Loading data...
                </div>
              </div>
              <div className="dashboard-chart-buttons" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button type="button" className="chart-toggle-btn active" data-dataset="0" style={{ '--btn-color': '#3b82f6' }}>
                  Profit
                </button>
                <button type="button" className="chart-toggle-btn active" data-dataset="1" style={{ '--btn-color': '#ef4444' }}>
                  Expenses
                </button>
                <button type="button" className="chart-toggle-btn active" data-dataset="2" style={{ '--btn-color': '#10b981' }}>
                  Net Profit
                </button>
                <button type="button" className="chart-toggle-btn active" data-dataset="3" style={{ '--btn-color': '#f59e0b' }}>
                  Earnings
                </button>
              </div>
            </div>
            <div className="dashboard-chart-container">
              <canvas id="trend-chart" />
            </div>
          </div>
        </div>
      </div>

      <div className="calendar-popup" id="calendar-popup" style={{ display: 'none' }}>
        <div className="calendar-header">
          <button type="button" className="calendar-nav-btn" onClick={(e) => { e.stopPropagation(); window.changeMonth?.(-1) }}>
            <i className="fas fa-chevron-left" />
          </button>
          <div className="calendar-month-year" onClick={(e) => e.stopPropagation()}>
            <select id="calendar-month-select" onChange={() => window.renderCalendar?.()}>
              <option value="0">Jan</option>
              <option value="1">Feb</option>
              <option value="2">Mar</option>
              <option value="3">Apr</option>
              <option value="4">May</option>
              <option value="5">Jun</option>
              <option value="6">Jul</option>
              <option value="7">Aug</option>
              <option value="8">Sep</option>
              <option value="9">Oct</option>
              <option value="10">Nov</option>
              <option value="11">Dec</option>
            </select>
            <select id="calendar-year-select" onChange={() => window.renderCalendar?.()} />
          </div>
          <button type="button" className="calendar-nav-btn" onClick={(e) => { e.stopPropagation(); window.changeMonth?.(1) }}>
            <i className="fas fa-chevron-right" />
          </button>
        </div>
        <div className="calendar-weekdays">
          <div className="calendar-weekday">Sun</div>
          <div className="calendar-weekday">Mon</div>
          <div className="calendar-weekday">Tue</div>
          <div className="calendar-weekday">Wed</div>
          <div className="calendar-weekday">Thu</div>
          <div className="calendar-weekday">Fri</div>
          <div className="calendar-weekday">Sat</div>
        </div>
        <div className="calendar-days" id="calendar-days" />
      </div>

      <div id="dashboardAlertModalOverlay" className="dashboard-alert-modal-overlay" aria-hidden="true">
        <div
          className="dashboard-alert-modal-box"
          role="dialog"
          aria-labelledby="dashboardAlertModalTitle"
          aria-describedby="dashboardAlertModalMessage"
        >
          <div className="dashboard-alert-modal-icon-wrap">
            <i className="fas fa-exclamation-triangle dashboard-alert-modal-icon" aria-hidden="true" />
          </div>
          <h3 id="dashboardAlertModalTitle" className="dashboard-alert-modal-title">
            Notice
          </h3>
          <p id="dashboardAlertModalMessage" className="dashboard-alert-modal-message" />
          <div className="dashboard-alert-modal-actions">
            <button
              type="button"
              id="dashboardAlertModalConfirmBtn"
              className="dashboard-alert-modal-btn dashboard-alert-modal-btn-primary"
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
