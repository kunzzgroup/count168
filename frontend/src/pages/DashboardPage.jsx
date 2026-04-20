import { useEffect, useMemo, useState } from 'react'
import { API, getJson } from '../lib/apiClient'
import './DashboardPage.css'

function formatMoney(value) {
  const num = Number(value || 0)
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num)
}

function DashboardPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [summary, setSummary] = useState(null)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [currency, setCurrency] = useState('')

  const query = useMemo(() => {
    const params = new URLSearchParams()
    if (dateFrom) params.set('date_from', dateFrom)
    if (dateTo) params.set('date_to', dateTo)
    if (currency) params.set('currency', currency)
    return params.toString()
  }, [dateFrom, dateTo, currency])

  useEffect(() => {
    let disposed = false
    async function loadSummary() {
      setLoading(true)
      setError('')
      try {
        const endpoint = query ? `${API.dashboardSummary}?${query}` : API.dashboardSummary
        const response = await getJson(endpoint)
        if (!disposed) {
          setSummary(response.data || null)
        }
      } catch (err) {
        if (!disposed) {
          setError(err.message)
        }
      } finally {
        if (!disposed) {
          setLoading(false)
        }
      }
    }
    loadSummary()
    return () => {
      disposed = true
    }
  }, [query])

  const cards = [
    { key: 'capital', label: 'Capital', value: summary?.capital ?? 0 },
    { key: 'expenses', label: 'Expenses', value: summary?.expenses ?? 0 },
    { key: 'profit', label: 'Net Profit', value: summary?.profit ?? 0 },
  ]

  return (
    <section className="dashboard-page">
      <header className="dashboard-header">
        <h1>Dashboard</h1>
        <div className="dashboard-filters">
          <label>
            From
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </label>
          <label>
            To
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </label>
          <label>
            Currency
            <input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} placeholder="MYR" />
          </label>
        </div>
      </header>

      {loading ? <p>Loading dashboard...</p> : null}
      {error ? <div className="message error">{error}</div> : null}

      {!loading && !error ? (
        <>
          <div className="dashboard-cards">
            {cards.map((card) => (
              <article className="dashboard-card" key={card.key}>
                <h2>{card.label}</h2>
                <p>{formatMoney(card.value)}</p>
              </article>
            ))}
          </div>
          <div className="dashboard-meta">
            <p>Range: {summary?.date_range?.from || '-'} to {summary?.date_range?.to || '-'}</p>
            <p>Ownership: {Number(summary?.ownership_percentage || 0).toFixed(2)}%</p>
          </div>
        </>
      ) : null}
    </section>
  )
}

export default DashboardPage

