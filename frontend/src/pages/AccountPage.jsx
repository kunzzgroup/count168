import { useEffect, useMemo, useState } from 'react'
import './AccountPage.css'

const API_BASE = import.meta.env.VITE_API_BASE || ''
const API = {
  list: `${API_BASE}/api/accounts/accountlistapi.php`,
  create: `${API_BASE}/api/accounts/addaccountapi.php`,
  update: `${API_BASE}/api/accounts/update_api.php`,
  delete: `${API_BASE}/api/accounts/delete_accounts_api.php`,
  toggleStatus: `${API_BASE}/api/accounts/toggle_account_status_api.php`,
}

const ROLE_OPTIONS = ['PARTNER', 'STAFF', 'DEBTOR', 'UPLINE', 'SUPPLIER']
const TABLE_COLUMNS = ['No', 'Account', 'Name', 'Role', 'Alert', 'Status', 'Last Login', 'Remark', 'Action']
const ROWS_PER_PAGE = 20

async function getJson(url) {
  const response = await fetch(url, { credentials: 'same-origin' })
  const json = await response.json()
  if (!response.ok || !json.success) {
    throw new Error(json.message || json.error || 'API request failed')
  }
  return json
}

async function postForm(url, payload) {
  const formData = new FormData()
  Object.entries(payload).forEach(([key, value]) => {
    if (value === undefined || value === null) return
    formData.append(key, String(value))
  })

  const response = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    body: formData,
  })
  const json = await response.json()
  if (!response.ok || !json.success) {
    throw new Error(json.message || json.error || 'API request failed')
  }
  return json
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const json = await response.json()
  if (!response.ok || !json.success) {
    throw new Error(json.message || json.error || 'API request failed')
  }
  return json
}

function toDisplayDate(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function normalizeAccount(item) {
  return {
    id: Number(item.id),
    account_id: item.account_id || '',
    name: item.name || '',
    role: (item.role || '').toUpperCase(),
    status: (item.status || '').toLowerCase(),
    is_alert: Number(item.is_alert || 0),
    last_login: item.last_login || '',
    remark: item.remark || '',
    payment_alert: Number(item.payment_alert || 0),
    alert_type: item.alert_type || item.alert_day || '',
    alert_start_date: item.alert_start_date || item.alert_specific_date || '',
    alert_amount: item.alert_amount ?? '',
  }
}

function AccountPage() {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [sortBy, setSortBy] = useState('account_id')
  const [sortDirection, setSortDirection] = useState('asc')
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedIds, setSelectedIds] = useState([])
  const [modalOpen, setModalOpen] = useState(false)
  const [editingAccount, setEditingAccount] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    account_id: '',
    name: '',
    role: 'PARTNER',
    password: '',
    payment_alert: '0',
    alert_type: '',
    alert_start_date: '',
    alert_amount: '',
    remark: '',
    status: 'active',
  })

  const resetMessages = () => {
    setError('')
    setNotice('')
  }

  const loadAccounts = async () => {
    try {
      setLoading(true)
      resetMessages()
      const params = new URLSearchParams()
      if (searchTerm.trim()) params.set('search', searchTerm.trim())
      if (showInactive) params.set('showInactive', 'true')
      if (showAll) params.set('showAll', 'true')

      const url = params.toString() ? `${API.list}?${params.toString()}` : API.list
      const result = await getJson(url)
      const list = Array.isArray(result.data?.accounts) ? result.data.accounts.map(normalizeAccount) : []
      setAccounts(list)
      setSelectedIds([])
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAccounts()
  }, [showInactive, showAll])

  const sortedAccounts = useMemo(() => {
    const keyword = searchTerm.trim().toUpperCase()
    const filtered = accounts.filter((item) => {
      if (!keyword) return true
      return (
        item.account_id.toUpperCase().includes(keyword) ||
        item.name.toUpperCase().includes(keyword) ||
        item.role.toUpperCase().includes(keyword)
      )
    })

    return [...filtered].sort((a, b) => {
      const factor = sortDirection === 'asc' ? 1 : -1
      if (sortBy === 'role') {
        return a.role.localeCompare(b.role) * factor
      }
      return a.account_id.localeCompare(b.account_id) * factor
    })
  }, [accounts, searchTerm, sortBy, sortDirection])

  const totalPages = showAll ? 1 : Math.max(1, Math.ceil(sortedAccounts.length / ROWS_PER_PAGE))

  const pagedAccounts = useMemo(() => {
    if (showAll) return sortedAccounts
    const start = (currentPage - 1) * ROWS_PER_PAGE
    return sortedAccounts.slice(start, start + ROWS_PER_PAGE)
  }, [sortedAccounts, currentPage, showAll])

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(1)
  }, [currentPage, totalPages])

  const toggleSort = (key) => {
    if (sortBy === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortBy(key)
    setSortDirection('asc')
  }

  const openCreateModal = () => {
    setEditingAccount(null)
    setForm({
      account_id: '',
      name: '',
      role: 'PARTNER',
      password: '',
      payment_alert: '0',
      alert_type: '',
      alert_start_date: '',
      alert_amount: '',
      remark: '',
      status: 'active',
    })
    setModalOpen(true)
  }

  const openEditModal = (account) => {
    setEditingAccount(account)
    setForm({
      account_id: account.account_id,
      name: account.name,
      role: account.role || 'PARTNER',
      password: '',
      payment_alert: String(account.payment_alert || 0),
      alert_type: account.alert_type || '',
      alert_start_date: account.alert_start_date ? String(account.alert_start_date).slice(0, 10) : '',
      alert_amount: account.alert_amount ?? '',
      remark: account.remark || '',
      status: account.status || 'active',
    })
    setModalOpen(true)
  }

  const closeModal = () => {
    if (!submitting) setModalOpen(false)
  }

  const handleSave = async (event) => {
    event.preventDefault()
    resetMessages()
    if (!editingAccount && !form.password.trim()) {
      setError('Password is required for new account')
      return
    }

    const payload = {
      account_id: form.account_id.trim().toUpperCase(),
      name: form.name.trim().toUpperCase(),
      role: form.role,
      payment_alert: Number(form.payment_alert),
      remark: form.remark.trim(),
      status: form.status,
    }

    if (Number(form.payment_alert) === 1) {
      payload.alert_type = form.alert_type
      payload.alert_start_date = form.alert_start_date
      if (String(form.alert_amount).trim() !== '') payload.alert_amount = form.alert_amount
    }

    if (form.password.trim()) payload.password = form.password

    try {
      setSubmitting(true)
      if (editingAccount) {
        await postForm(API.update, { ...payload, id: editingAccount.id })
        setNotice('Account updated successfully')
      } else {
        await postForm(API.create, payload)
        setNotice('Account created successfully')
      }
      setModalOpen(false)
      await loadAccounts()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  const toggleAccountStatus = async (account) => {
    try {
      resetMessages()
      const formData = new FormData()
      formData.append('id', String(account.id))
      const response = await fetch(API.toggleStatus, {
        method: 'POST',
        credentials: 'same-origin',
        body: formData,
      })
      const json = await response.json()
      if (!response.ok || !json.success) {
        throw new Error(json.message || json.error || 'Failed to toggle status')
      }
      setAccounts((prev) =>
        prev.map((item) =>
          item.id === account.id ? { ...item, status: json.data?.newStatus || item.status } : item,
        ),
      )
      setNotice('Status updated')
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  const handleDeleteSelected = async () => {
    if (selectedIds.length === 0) return
    if (!window.confirm(`Delete ${selectedIds.length} selected account(s)?`)) return
    resetMessages()

    try {
      const result = await postJson(API.delete, { ids: selectedIds })
      setNotice(result.message || 'Accounts deleted')
      await loadAccounts()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  const inactiveIdsOnPage = pagedAccounts.filter((item) => item.status === 'inactive').map((item) => item.id)
  const allChecked =
    inactiveIdsOnPage.length > 0 && inactiveIdsOnPage.every((accountId) => selectedIds.includes(accountId))

  return (
    <section className='account-react-page'>
      <header className='account-react-header'>
        <h1>Account List</h1>
      </header>
      <div className='account-react-separator' />

      {error ? <div className='account-react-message account-react-message-error'>{error}</div> : null}
      {notice ? <div className='account-react-message account-react-message-success'>{notice}</div> : null}

      <div className='account-react-toolbar'>
        <div className='account-react-toolbar-left'>
          <button type='button' className='account-react-btn account-react-btn-primary' onClick={openCreateModal}>
            Add Account
          </button>
          <input
            type='text'
            className='account-react-search'
            value={searchTerm}
            onChange={(event) => {
              setSearchTerm(event.target.value)
              setCurrentPage(1)
            }}
            placeholder='Search by Account or Name'
          />
          <label className='account-react-checkbox'>
            <input
              type='checkbox'
              checked={showInactive}
              onChange={(event) => {
                setShowInactive(event.target.checked)
                if (event.target.checked) setShowAll(false)
                setCurrentPage(1)
              }}
            />
            <span>Show Inactive</span>
          </label>
          <label className='account-react-checkbox'>
            <input
              type='checkbox'
              checked={showAll}
              onChange={(event) => {
                setShowAll(event.target.checked)
                if (event.target.checked) setShowInactive(false)
                setCurrentPage(1)
              }}
            />
            <span>Show All</span>
          </label>
        </div>
        <button
          type='button'
          className='account-react-btn account-react-btn-danger'
          disabled={selectedIds.length === 0}
          onClick={handleDeleteSelected}
        >
          {selectedIds.length > 0 ? `Delete (${selectedIds.length})` : 'Delete'}
        </button>
      </div>

      <div className='account-react-table-wrap'>
        <div className='account-react-table-head'>
          {TABLE_COLUMNS.map((col) => (
            <div
              key={col}
              className={`account-react-th ${col === 'Account' || col === 'Role' ? 'account-react-th-sort' : ''}`}
              onClick={() => {
                if (col === 'Account') toggleSort('account_id')
                if (col === 'Role') toggleSort('role')
              }}
            >
              {col}
              {col === 'Account' && sortBy === 'account_id' ? ` ${sortDirection === 'asc' ? '▲' : '▼'}` : ''}
              {col === 'Role' && sortBy === 'role' ? ` ${sortDirection === 'asc' ? '▲' : '▼'}` : ''}
            </div>
          ))}
        </div>

        {loading ? <div className='account-react-empty'>Loading...</div> : null}
        {!loading && pagedAccounts.length === 0 ? <div className='account-react-empty'>No account data found.</div> : null}
        {!loading && pagedAccounts.length > 0 ? (
          <div className='account-react-table-body'>
            {pagedAccounts.map((item, index) => (
              <div className='account-react-row' key={item.id}>
                <div>{showAll ? index + 1 : (currentPage - 1) * ROWS_PER_PAGE + index + 1}</div>
                <div>{item.account_id}</div>
                <div>{item.name}</div>
                <div className='account-react-role'>{item.role}</div>
                <div>{item.is_alert === 1 ? 'ALERT' : '-'}</div>
                <div>
                  <button
                    type='button'
                    className={`account-react-status account-react-status-${item.status}`}
                    onClick={() => toggleAccountStatus(item)}
                  >
                    {item.status.toUpperCase()}
                  </button>
                </div>
                <div>{toDisplayDate(item.last_login)}</div>
                <div>{item.remark || '-'}</div>
                <div className='account-react-actions'>
                  <button type='button' className='account-react-icon-btn' onClick={() => openEditModal(item)}>
                    Edit
                  </button>
                  {item.status === 'inactive' ? (
                    <input
                      type='checkbox'
                      checked={selectedIds.includes(item.id)}
                      onChange={(event) => {
                        setSelectedIds((prev) =>
                          event.target.checked ? [...prev, item.id] : prev.filter((id) => id !== item.id),
                        )
                      }}
                    />
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {!showAll && sortedAccounts.length > 0 ? (
        <div className='account-react-pagination'>
          <button type='button' disabled={currentPage <= 1} onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}>
            ◀
          </button>
          <span>{`${currentPage} of ${totalPages}`}</span>
          <button
            type='button'
            disabled={currentPage >= totalPages}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
          >
            ▶
          </button>
          <label className='account-react-checkbox account-react-selectall'>
            <input
              type='checkbox'
              checked={allChecked}
              onChange={(event) => {
                if (event.target.checked) {
                  setSelectedIds((prev) => Array.from(new Set([...prev, ...inactiveIdsOnPage])))
                } else {
                  setSelectedIds((prev) => prev.filter((id) => !inactiveIdsOnPage.includes(id)))
                }
              }}
            />
            <span>Select page inactive</span>
          </label>
        </div>
      ) : null}

      {modalOpen ? (
        <div className='account-react-modal-mask' onClick={closeModal}>
          <div className='account-react-modal' onClick={(event) => event.stopPropagation()}>
            <h2>{editingAccount ? 'Edit Account' : 'Add Account'}</h2>
            <form className='account-react-form' onSubmit={handleSave}>
              <label>
                Account ID *
                <input
                  value={form.account_id}
                  disabled={Boolean(editingAccount)}
                  onChange={(event) => setForm((prev) => ({ ...prev, account_id: event.target.value }))}
                  required
                />
              </label>
              <label>
                Name *
                <input
                  value={form.name}
                  onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                  required
                />
              </label>
              <label>
                Role *
                <select value={form.role} onChange={(event) => setForm((prev) => ({ ...prev, role: event.target.value }))}>
                  {ROLE_OPTIONS.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Status *
                <select value={form.status} onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}>
                  <option value='active'>active</option>
                  <option value='inactive'>inactive</option>
                </select>
              </label>
              <label>
                Password {editingAccount ? '(leave blank to keep)' : '*'}
                <input
                  type='password'
                  value={form.password}
                  onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                />
              </label>
              <label className='account-react-inline'>
                Payment Alert
                <select
                  value={form.payment_alert}
                  onChange={(event) => setForm((prev) => ({ ...prev, payment_alert: event.target.value }))}
                >
                  <option value='0'>No</option>
                  <option value='1'>Yes</option>
                </select>
              </label>
              {Number(form.payment_alert) === 1 ? (
                <>
                  <label>
                    Alert Type *
                    <input
                      value={form.alert_type}
                      placeholder='weekly / monthly / 1-31'
                      onChange={(event) => setForm((prev) => ({ ...prev, alert_type: event.target.value }))}
                      required
                    />
                  </label>
                  <label>
                    Start Date *
                    <input
                      type='date'
                      value={form.alert_start_date}
                      onChange={(event) => setForm((prev) => ({ ...prev, alert_start_date: event.target.value }))}
                      required
                    />
                  </label>
                  <label>
                    Alert Amount
                    <input
                      type='number'
                      step='0.01'
                      value={form.alert_amount}
                      onChange={(event) => setForm((prev) => ({ ...prev, alert_amount: event.target.value }))}
                    />
                  </label>
                </>
              ) : null}
              <label>
                Remark
                <textarea
                  rows={2}
                  value={form.remark}
                  onChange={(event) => setForm((prev) => ({ ...prev, remark: event.target.value }))}
                />
              </label>
              <div className='account-react-form-actions'>
                <button type='button' onClick={closeModal} disabled={submitting}>
                  Cancel
                </button>
                <button type='submit' disabled={submitting}>
                  {submitting ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  )
}

export default AccountPage
