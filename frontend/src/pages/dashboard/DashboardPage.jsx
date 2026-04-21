import { useEffect, useMemo, useState } from 'react'
import './DashboardPage.css'

const API_BASE = import.meta.env.VITE_API_BASE || ''
const API = {
  dashboard: `${API_BASE}/api/transactions/dashboard_api.php`,
  companies: `${API_BASE}/api/transactions/get_owner_companies_api.php?all=1`,
  companyCurrencies: `${API_BASE}/api/transactions/get_company_currencies_api.php`,
  switchCompany: `${API_BASE}/api/session/update_company_session_api.php`,
}

function formatYmd(date) {
  return date.toISOString().slice(0, 10)
}

function money(value) {
  const num = Number(value || 0)
  if (!Number.isFinite(num)) return '0.00'
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function dateRangeDays(startDate, endDate) {
  const start = new Date(startDate)
  const end = new Date(endDate)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return []
  const out = []
  const current = new Date(start)
  while (current <= end) {
    out.push(formatYmd(current))
    current.setDate(current.getDate() + 1)
  }
  return out
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...options,
  })
  const json = await response.json()
  if (!response.ok || json.success === false) {
    throw new Error(json.message || json.error || 'API request failed')
  }
  return json
}

function normalizeCompany(item) {
  return {
    id: Number(item.id),
    company_id: String(item.company_id || '').toUpperCase(),
    expiration_date: item.expiration_date || null,
  }
}

function DashboardPage() {
  const now = new Date()
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
  const [fromDate, setFromDate] = useState(formatYmd(firstDay))
  const [toDate, setToDate] = useState(formatYmd(now))
  const [companies, setCompanies] = useState([])
  const [selectedCompanyId, setSelectedCompanyId] = useState('')
  const [currencies, setCurrencies] = useState([])
  const [selectedCurrency, setSelectedCurrency] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [dashboardData, setDashboardData] = useState(null)

  const loadCompanies = async () => {
    const result = await fetchJson(API.companies)
    const list = Array.isArray(result.data) ? result.data.map(normalizeCompany) : []
    setCompanies(list)
    if (list.length > 0) {
      setSelectedCompanyId((prev) => (prev ? prev : String(list[0].id)))
    }
  }

  const loadCurrencies = async (companyId) => {
    if (!companyId) return
    const result = await fetchJson(`${API.companyCurrencies}?company_id=${encodeURIComponent(companyId)}`)
    const list = Array.isArray(result.data)
      ? result.data.map((row) => ({ id: Number(row.id), code: String(row.code || '').toUpperCase() }))
      : []
    setCurrencies(list)
    setSelectedCurrency((prev) => (prev && list.some((item) => item.code === prev) ? prev : ''))
  }

  const loadDashboard = async () => {
    if (!selectedCompanyId) return
    if (!fromDate || !toDate || new Date(fromDate) > new Date(toDate)) {
      setError('Invalid date range')
      return
    }
    setLoading(true)
    setError('')
    setNotice('')
    try {
      const query = new URLSearchParams({
        company_id: selectedCompanyId,
        date_from: fromDate,
        date_to: toDate,
      })
      if (selectedCurrency) query.set('currency', selectedCurrency)
      const result = await fetchJson(`${API.dashboard}?${query.toString()}`)
      setDashboardData(result.data || null)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCompanies().catch((requestError) => setError(requestError.message))
  }, [])

  useEffect(() => {
    if (!selectedCompanyId) return
    loadCurrencies(selectedCompanyId).catch((requestError) => setError(requestError.message))
  }, [selectedCompanyId])

  useEffect(() => {
    loadDashboard()
  }, [selectedCompanyId, fromDate, toDate, selectedCurrency])

  const dailySeries = useMemo(() => {
    if (!dashboardData?.daily_data) return []
    const days = dateRangeDays(fromDate, toDate)
    return days.map((day) => ({
      day,
      capital: Number(dashboardData.daily_data.capital?.[day] || 0),
      expenses: Number(dashboardData.daily_data.expenses?.[day] || 0),
      profit: Number(dashboardData.daily_data.profit?.[day] || 0),
      paymentFlow: Number(dashboardData.daily_data.profit_payment_flow_daily?.[day] || 0),
    }))
  }, [dashboardData, fromDate, toDate])

  const chartPoints = useMemo(() => {
    if (dailySeries.length === 0) return { capital: '', expenses: '', profit: '', max: 1 }
    const max = Math.max(
      ...dailySeries.flatMap((item) => [Math.abs(item.capital), Math.abs(item.expenses), Math.abs(item.profit), 1]),
    )
    const width = Math.max(1, dailySeries.length - 1)
    const build = (key) =>
      dailySeries
        .map((item, index) => {
          const x = (index / width) * 100
          const y = 50 - (item[key] / max) * 40
          return `${x},${y}`
        })
        .join(' ')
    return {
      capital: build('capital'),
      expenses: build('expenses'),
      profit: build('profit'),
      max,
    }
  }, [dailySeries])

  const switchCompany = async (companyId) => {
    if (!companyId) return
    try {
      await fetchJson(`${API.switchCompany}?company_id=${encodeURIComponent(companyId)}`, { method: 'POST' })
      setSelectedCompanyId(String(companyId))
      setNotice('Company switched')
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  return (
    <section className='dashboard-page'>
      <header className='dashboard-header'>
        <h1>Transaction Dashboard</h1>
      </header>
      <div className='dashboard-separator' />

      {error ? <div className='dashboard-message dashboard-message-error'>{error}</div> : null}
      {notice ? <div className='dashboard-message dashboard-message-success'>{notice}</div> : null}

      <div className='dashboard-toolbar'>
        <label>
          Company
          <select value={selectedCompanyId} onChange={(event) => switchCompany(event.target.value)}>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.company_id}
              </option>
            ))}
          </select>
        </label>
        <label>
          Currency
          <select value={selectedCurrency} onChange={(event) => setSelectedCurrency(event.target.value)}>
            <option value=''>All</option>
            {currencies.map((currency) => (
              <option key={currency.id} value={currency.code}>
                {currency.code}
              </option>
            ))}
          </select>
        </label>
        <label>
          From
          <input type='date' value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
        </label>
        <label>
          To
          <input type='date' value={toDate} onChange={(event) => setToDate(event.target.value)} />
        </label>
        <button type='button' onClick={loadDashboard} disabled={loading}>
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      <div className='dashboard-cards'>
        <article className='dashboard-card'>
          <h3>Capital</h3>
          <div className='dashboard-card-value'>{money(dashboardData?.capital)}</div>
          <p>Period: {money(dashboardData?.period_total?.capital)}</p>
          <p>B/F: {money(dashboardData?.initial_balance?.capital)}</p>
        </article>
        <article className='dashboard-card'>
          <h3>Expenses</h3>
          <div className='dashboard-card-value'>{money(dashboardData?.expenses)}</div>
          <p>Period: {money(dashboardData?.period_total?.expenses)}</p>
          <p>B/F: {money(dashboardData?.initial_balance?.expenses)}</p>
        </article>
        <article className='dashboard-card'>
          <h3>Net Profit</h3>
          <div className='dashboard-card-value'>{money(dashboardData?.profit)}</div>
          <p>Period: {money(dashboardData?.period_total?.profit)}</p>
          <p>B/F: {money(dashboardData?.initial_balance?.profit)}</p>
        </article>
      </div>

      <div className='dashboard-chart-wrap'>
        <h2>Daily Trend</h2>
        <div className='dashboard-chart'>
          <svg viewBox='0 0 100 100' preserveAspectRatio='none'>
            <line x1='0' y1='50' x2='100' y2='50' className='chart-axis' />
            <polyline points={chartPoints.capital} className='chart-line chart-line-capital' />
            <polyline points={chartPoints.expenses} className='chart-line chart-line-expenses' />
            <polyline points={chartPoints.profit} className='chart-line chart-line-profit' />
          </svg>
          <div className='dashboard-legend'>
            <span className='capital'>Capital</span>
            <span className='expenses'>Expenses</span>
            <span className='profit'>Profit</span>
          </div>
        </div>
      </div>

      <div className='dashboard-table-wrap'>
        <div className='dashboard-table-head'>
          <div>Date</div>
          <div>Capital</div>
          <div>Expenses</div>
          <div>Profit</div>
          <div>Profit Payment Flow</div>
        </div>
        <div className='dashboard-table-body'>
          {dailySeries.length === 0 ? (
            <div className='dashboard-empty'>No data in selected date range</div>
          ) : (
            dailySeries.map((row) => (
              <div className='dashboard-row' key={row.day}>
                <div>{row.day}</div>
                <div>{money(row.capital)}</div>
                <div>{money(row.expenses)}</div>
                <div>{money(row.profit)}</div>
                <div>{money(row.paymentFlow)}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  )
}

export default DashboardPage
