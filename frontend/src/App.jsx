import { useEffect, useMemo, useState } from 'react'
import Sidebar from './components/Sidebar'
import AdminPage from './pages/AdminPage'
import './App.css'

const API_URL = import.meta.env.VITE_DOMAIN_API_URL || '/api/domain/domain_api.php'

const defaultForm = {
  id: '',
  owner_code: '',
  name: '',
  email: '',
  password: '',
  secondary_password: '',
  companiesText: '',
}

function parseCompanies(companiesText) {
  const uniqueIds = Array.from(
    new Set(
      companiesText
        .split(/[\n,]+/)
        .map((value) => value.trim().toUpperCase())
        .filter(Boolean),
    ),
  )

  return uniqueIds.map((companyId) => ({
    company_id: companyId,
    expiration_date: null,
    permissions: [],
    group_id: null,
    fee_share_allocations: { sales: [], cs: [], it: [] },
    apply_commission_payments_on_domain_save: false,
  }))
}

async function apiRequest(payload) {
  const response = await fetch(API_URL, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  const json = await response.json()
  if (!response.ok || !json.success) {
    throw new Error(json.message || 'API request failed')
  }
  return json
}

function App() {
  const [currentRoute, setCurrentRoute] = useState(window.location.hash || '#/')
  const [domains, setDomains] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [deletingIds, setDeletingIds] = useState([])
  const [selectedIds, setSelectedIds] = useState([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isEditMode, setIsEditMode] = useState(false)
  const [form, setForm] = useState(defaultForm)

  useEffect(() => {
    const onHashChange = () => setCurrentRoute(window.location.hash || '#/')
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const filteredDomains = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    if (!term) return domains

    return domains.filter((domain) => {
      const companyText = Array.isArray(domain.companies_full)
        ? domain.companies_full.map((item) => item.company_id).join(' ')
        : domain.companies || ''
      return (
        domain.owner_code?.toLowerCase().includes(term) ||
        domain.name?.toLowerCase().includes(term) ||
        domain.email?.toLowerCase().includes(term) ||
        companyText.toLowerCase().includes(term)
      )
    })
  }, [domains, searchTerm])

  const resetMessages = () => {
    setError('')
    setNotice('')
  }

  const loadDomains = async () => {
    try {
      setLoading(true)
      setError('')
      const result = await apiRequest({ action: 'get_domains' })
      setDomains(Array.isArray(result.data?.domains) ? result.data.domains : [])
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadDomains()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  const openCreateModal = () => {
    resetMessages()
    setIsEditMode(false)
    setForm(defaultForm)
    setIsModalOpen(true)
  }

  const openEditModal = async (domain) => {
    resetMessages()
    setIsEditMode(true)
    setSaving(true)
    try {
      const companiesResult = await apiRequest({
        action: 'get_companies',
        owner_id: domain.id,
      })
      const companies = Array.isArray(companiesResult.data?.companies)
        ? companiesResult.data.companies
        : []
      const companyIds = companies
        .map((item) => item.company_id)
        .filter(Boolean)
        .join(', ')

      setForm({
        id: String(domain.id),
        owner_code: domain.owner_code || '',
        name: domain.name || '',
        email: domain.email || '',
        password: '',
        secondary_password: '',
        companiesText: companyIds,
      })
      setIsModalOpen(true)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  const closeModal = () => {
    setIsModalOpen(false)
    setForm(defaultForm)
  }

  const onInputChange = (event) => {
    const { name, value } = event.target
    setForm((previous) => ({
      ...previous,
      [name]: name === 'email' ? value.toLowerCase() : value,
    }))
  }

  const onSubmit = async (event) => {
    event.preventDefault()
    resetMessages()
    setSaving(true)

    try {
      const payload = {
        action: isEditMode ? 'update' : 'create',
        id: isEditMode ? Number(form.id) : undefined,
        owner_code: form.owner_code.trim().toUpperCase(),
        name: form.name.trim().toUpperCase(),
        email: form.email.trim().toLowerCase(),
        companies: JSON.stringify(parseCompanies(form.companiesText)),
      }

      if (form.password.trim()) {
        payload.password = form.password.trim()
      }
      if (form.secondary_password.trim()) {
        payload.secondary_password = form.secondary_password.trim()
      }

      if (!isEditMode && (!payload.password || !payload.secondary_password)) {
        throw new Error('新增时 Password 和 Secondary Password 必填')
      }

      await apiRequest(payload)
      setNotice(isEditMode ? 'Domain 更新成功' : 'Domain 新增成功')
      closeModal()
      await loadDomains()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  const toggleSelect = (id) => {
    setSelectedIds((previous) =>
      previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id],
    )
  }

  const onDeleteSelected = async () => {
    if (selectedIds.length === 0) return
    if (!window.confirm(`确认删除 ${selectedIds.length} 条 Domain 记录？`)) return

    resetMessages()
    setDeletingIds(selectedIds)
    try {
      await Promise.all(selectedIds.map((id) => apiRequest({ action: 'delete', id })))
      setNotice('删除成功')
      setSelectedIds([])
      await loadDomains()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setDeletingIds([])
    }
  }

  return (
    <div className="app-layout">
      <Sidebar currentRoute={currentRoute} />
      <main className="app-content">
        {currentRoute === '#/admin' ? (
          <AdminPage />
        ) : (
          <section className="domain-page">
            <header className="page-header">
              <h1>Domain List (React)</h1>
              <p>前端已改为 React，后端继续使用 `api/domain/domain_api.php`。</p>
            </header>

            <section className="toolbar">
              <button type="button" onClick={openCreateModal}>
                Add Domain
              </button>
              <input
                type="text"
                placeholder="Search by owner / name / email / company"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
              <button
                type="button"
                onClick={onDeleteSelected}
                disabled={selectedIds.length === 0 || deletingIds.length > 0}
              >
                Delete Selected ({selectedIds.length})
              </button>
            </section>

            {error ? <div className="message error">{error}</div> : null}
            {notice ? <div className="message success">{notice}</div> : null}

            <section className="table-wrap">
              <table className="domain-table">
                <thead>
                  <tr>
                    <th />
                    <th>No</th>
                    <th>Owner Code</th>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Group ID</th>
                    <th>Companies</th>
                    <th>Created By</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={9}>Loading...</td>
                    </tr>
                  ) : null}
                  {!loading && filteredDomains.length === 0 ? (
                    <tr>
                      <td colSpan={9}>No data</td>
                    </tr>
                  ) : null}
                  {!loading &&
                    filteredDomains.map((domain, index) => (
                      <tr key={domain.id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(domain.id)}
                            onChange={() => toggleSelect(domain.id)}
                          />
                        </td>
                        <td>{index + 1}</td>
                        <td>{domain.owner_code}</td>
                        <td>{domain.name}</td>
                        <td>{domain.email}</td>
                        <td>{domain.group_ids || '-'}</td>
                        <td>{domain.companies || '-'}</td>
                        <td>{String(domain.created_by || '-').toUpperCase()}</td>
                        <td>
                          <button
                            type="button"
                            onClick={() => openEditModal(domain)}
                            disabled={saving || deletingIds.includes(domain.id)}
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </section>

            {isModalOpen ? (
              <div className="modal-mask" onClick={closeModal}>
                <div className="modal" onClick={(event) => event.stopPropagation()}>
                  <h2>{isEditMode ? 'Edit Domain' : 'Add Domain'}</h2>
                  <form onSubmit={onSubmit} className="domain-form">
                    <label>
                      Owner Code
                      <input
                        name="owner_code"
                        value={form.owner_code}
                        onChange={onInputChange}
                        disabled={isEditMode}
                        required
                      />
                    </label>
                    <label>
                      Name
                      <input name="name" value={form.name} onChange={onInputChange} required />
                    </label>
                    <label>
                      Email
                      <input name="email" value={form.email} onChange={onInputChange} required />
                    </label>
                    <label>
                      Password {isEditMode ? '(留空则不修改)' : ''}
                      <input
                        name="password"
                        type="password"
                        value={form.password}
                        onChange={onInputChange}
                        required={!isEditMode}
                      />
                    </label>
                    <label>
                      Secondary Password {isEditMode ? '(留空则不修改)' : ''}
                      <input
                        name="secondary_password"
                        type="password"
                        maxLength={6}
                        value={form.secondary_password}
                        onChange={onInputChange}
                        required={!isEditMode}
                      />
                    </label>
                    <label>
                      Companies (comma/new line separated)
                      <textarea
                        name="companiesText"
                        value={form.companiesText}
                        onChange={onInputChange}
                        rows={4}
                        placeholder="AA, BB, CC"
                      />
                    </label>
                    <div className="form-actions">
                      <button type="submit" disabled={saving}>
                        {saving ? 'Saving...' : 'Confirm'}
                      </button>
                      <button type="button" onClick={closeModal}>
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            ) : null}
          </section>
        )}
      </main>
    </div>
  )
}

export default App
