import { useEffect, useMemo, useState } from 'react'
import './DomainPage.css'

const API_BASE = import.meta.env.VITE_API_BASE || ''
const API_URL = `${API_BASE}/api/domain/domain_api.php`
const PAGE_SIZE = 20
const PERMISSION_OPTIONS = ['Games', 'Bank', 'Loan', 'Rate', 'Money']

async function postJson(payload) {
  const response = await fetch(API_URL, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const json = await response.json()
  if (!response.ok || !json.success) {
    throw new Error(json.message || 'API request failed')
  }
  return json
}

function buildEmptyCompany() {
  return {
    company_id: '',
    expiration_date: '',
    group_id: '',
    permissions: [],
  }
}

function buildEmptyOwnerForm() {
  return {
    id: null,
    owner_code: '',
    name: '',
    email: '',
    password: '',
    secondary_password: '',
    companies: [buildEmptyCompany()],
  }
}

function normalizeDomain(item) {
  const groups = String(item.group_ids || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
  const companies = String(item.companies || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
  return {
    id: Number(item.id),
    owner_code: item.owner_code || '',
    name: item.name || '',
    email: item.email || '',
    created_at: item.created_at || '',
    groups,
    companies,
  }
}

function DomainPage() {
  const [domains, setDomains] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(buildEmptyOwnerForm())
  const [domainFeePrice, setDomainFeePrice] = useState('')
  const [savingFee, setSavingFee] = useState(false)

  const [shareModalOpen, setShareModalOpen] = useState(false)
  const [shareCompanyCode, setShareCompanyCode] = useState('')
  const [shareData, setShareData] = useState({ sales: [], cs: [], it: [] })
  const [shareAccounts, setShareAccounts] = useState([])
  const [shareSaving, setShareSaving] = useState(false)
  const [applyCommissionPayments, setApplyCommissionPayments] = useState(true)

  const loadDomains = async () => {
    setLoading(true)
    setError('')
    try {
      const result = await postJson({ action: 'get_domains' })
      const rows = Array.isArray(result.data?.domains) ? result.data.domains.map(normalizeDomain) : []
      setDomains(rows)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  const loadDomainFeeSettings = async () => {
    try {
      const result = await postJson({ action: 'get_domain_fee_settings' })
      const price = result.data?.price
      setDomainFeePrice(price === null || price === undefined ? '' : String(price))
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  useEffect(() => {
    loadDomains()
    loadDomainFeeSettings()
  }, [])

  const filteredRows = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase()
    return domains.filter((row) => {
      if (!keyword) return true
      return (
        row.owner_code.toLowerCase().includes(keyword) ||
        row.name.toLowerCase().includes(keyword) ||
        row.email.toLowerCase().includes(keyword) ||
        row.companies.some((company) => company.toLowerCase().includes(keyword))
      )
    })
  }, [domains, searchTerm])

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))
  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE
    return filteredRows.slice(start, start + PAGE_SIZE)
  }, [filteredRows, currentPage])

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(1)
  }, [currentPage, totalPages])

  const openCreateModal = () => {
    setForm(buildEmptyOwnerForm())
    setModalOpen(true)
  }

  const openEditModal = async (row) => {
    setError('')
    try {
      const companyRes = await postJson({ action: 'get_companies', owner_id: row.id })
      const companies = Array.isArray(companyRes.data?.companies)
        ? companyRes.data.companies.map((item) => ({
            company_id: String(item.company_id || ''),
            expiration_date: item.expiration_date || '',
            group_id: item.group_id || '',
            permissions: Array.isArray(item.permissions) ? item.permissions : [],
            fee_share_allocations: item.fee_share_allocations || undefined,
          }))
        : []
      setForm({
        id: row.id,
        owner_code: row.owner_code,
        name: row.name,
        email: row.email,
        password: '',
        secondary_password: '',
        companies: companies.length > 0 ? companies : [buildEmptyCompany()],
      })
      setModalOpen(true)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  const updateFormField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }))

  const updateCompanyField = (index, key, value) => {
    setForm((prev) => {
      const next = [...prev.companies]
      next[index] = { ...next[index], [key]: value }
      return { ...prev, companies: next }
    })
  }

  const toggleCompanyPermission = (index, permission) => {
    setForm((prev) => {
      const next = [...prev.companies]
      const current = Array.isArray(next[index].permissions) ? next[index].permissions : []
      const exists = current.includes(permission)
      next[index] = {
        ...next[index],
        permissions: exists ? current.filter((item) => item !== permission) : [...current, permission],
      }
      return { ...prev, companies: next }
    })
  }

  const addCompanyRow = () => setForm((prev) => ({ ...prev, companies: [...prev.companies, buildEmptyCompany()] }))

  const removeCompanyRow = (index) => {
    setForm((prev) => {
      const next = prev.companies.filter((_, idx) => idx !== index)
      return { ...prev, companies: next.length > 0 ? next : [buildEmptyCompany()] }
    })
  }

  const submitForm = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const companiesPayload = form.companies
        .map((company) => ({
          ...company,
          company_id: String(company.company_id || '').toUpperCase().trim(),
          group_id: String(company.group_id || '').toUpperCase().trim(),
          expiration_date: company.expiration_date || null,
          permissions: Array.isArray(company.permissions) ? company.permissions : [],
        }))
        .filter((company) => company.company_id || company.group_id)

      const payload = {
        action: form.id ? 'update' : 'create',
        owner_code: String(form.owner_code || '').toUpperCase().trim(),
        name: String(form.name || '').trim().toUpperCase(),
        email: String(form.email || '').trim().toLowerCase(),
        password: form.password,
        secondary_password: String(form.secondary_password || '').trim(),
        companies: companiesPayload,
      }
      if (form.id) {
        payload.id = form.id
        delete payload.owner_code
      }
      if (!payload.password) delete payload.password
      if (!payload.secondary_password) delete payload.secondary_password

      await postJson(payload)
      setModalOpen(false)
      setNotice(form.id ? 'Domain updated successfully' : 'Domain created successfully')
      await loadDomains()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  const deleteDomain = async (id) => {
    if (!window.confirm('Delete this domain owner and all related data?')) return
    setError('')
    setNotice('')
    try {
      await postJson({ action: 'delete', id })
      setNotice('Domain deleted successfully')
      await loadDomains()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  const saveDomainFeeSettings = async () => {
    setSavingFee(true)
    setError('')
    setNotice('')
    try {
      await postJson({ action: 'save_domain_fee_settings', price: domainFeePrice === '' ? null : domainFeePrice })
      setNotice('Domain fee saved')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSavingFee(false)
    }
  }

  const openShareModal = async (companyCode) => {
    setError('')
    try {
      const result = await postJson({ action: 'get_company_share_settings', company_id: companyCode })
      setShareCompanyCode(companyCode)
      setShareData(result.data?.allocations || { sales: [], cs: [], it: [] })
      setShareAccounts(Array.isArray(result.data?.accounts) ? result.data.accounts : [])
      setApplyCommissionPayments(true)
      setShareModalOpen(true)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  const addShareRow = (role) => {
    setShareData((prev) => ({ ...prev, [role]: [...(prev[role] || []), { account_id: 0, percentage: '' }] }))
  }

  const updateShareRow = (role, index, key, value) => {
    setShareData((prev) => {
      const nextRoleRows = [...(prev[role] || [])]
      nextRoleRows[index] = { ...nextRoleRows[index], [key]: value }
      return { ...prev, [role]: nextRoleRows }
    })
  }

  const removeShareRow = (role, index) => {
    setShareData((prev) => {
      const nextRoleRows = (prev[role] || []).filter((_, idx) => idx !== index)
      return { ...prev, [role]: nextRoleRows }
    })
  }

  const saveShareSettings = async () => {
    setShareSaving(true)
    setError('')
    setNotice('')
    try {
      await postJson({
        action: 'save_company_share_settings',
        company_id: shareCompanyCode,
        fee_share_allocations: shareData,
        apply_commission_payments: applyCommissionPayments,
      })
      setShareModalOpen(false)
      setNotice(`Share settings saved for ${shareCompanyCode}`)
      await loadDomains()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setShareSaving(false)
    }
  }

  return (
    <section className='domain-page'>
      <header className='domain-header'>
        <h1>Domain List</h1>
      </header>
      <div className='domain-separator' />

      {error ? <div className='domain-message domain-message-error'>{error}</div> : null}
      {notice ? <div className='domain-message domain-message-success'>{notice}</div> : null}

      <section className='domain-fee-panel'>
        <h2>Domain Fee Settings</h2>
        <div className='domain-fee-row'>
          <input
            value={domainFeePrice}
            onChange={(event) => setDomainFeePrice(event.target.value)}
            placeholder='Price'
            inputMode='decimal'
          />
          <button type='button' onClick={saveDomainFeeSettings} disabled={savingFee}>
            {savingFee ? 'Saving...' : 'Save Fee'}
          </button>
        </div>
      </section>

      <div className='domain-toolbar'>
        <button type='button' className='domain-btn domain-btn-primary' onClick={openCreateModal}>
          Add Domain
        </button>
        <input
          className='domain-search'
          value={searchTerm}
          onChange={(event) => {
            setSearchTerm(event.target.value)
            setCurrentPage(1)
          }}
          placeholder='Search by owner/company/email'
        />
      </div>

      <div className='domain-table-wrap'>
        <div className='domain-table-head'>
          <div>No</div>
          <div>Owner Code</div>
          <div>Name</div>
          <div>Email</div>
          <div>Groups</div>
          <div>Companies</div>
          <div>Actions</div>
        </div>
        {loading ? <div className='domain-empty'>Loading...</div> : null}
        {!loading && pagedRows.length === 0 ? <div className='domain-empty'>No domains found</div> : null}
        {!loading && pagedRows.length > 0 ? (
          <div className='domain-table-body'>
            {pagedRows.map((row, index) => (
              <div className='domain-row' key={row.id}>
                <div>{(currentPage - 1) * PAGE_SIZE + index + 1}</div>
                <div>{row.owner_code}</div>
                <div>{row.name}</div>
                <div>{row.email}</div>
                <div>{row.groups.length ? row.groups.join(', ') : '-'}</div>
                <div className='domain-company-cell'>
                  {row.companies.length ? row.companies.join(', ') : '-'}
                </div>
                <div className='domain-actions'>
                  <button type='button' onClick={() => openEditModal(row)}>
                    Edit
                  </button>
                  <button type='button' className='danger' onClick={() => deleteDomain(row.id)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {filteredRows.length > 0 ? (
        <div className='domain-pagination'>
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
        </div>
      ) : null}

      {modalOpen ? (
        <div className='domain-modal-mask' onClick={() => (!saving ? setModalOpen(false) : null)}>
          <div className='domain-modal' onClick={(event) => event.stopPropagation()}>
            <h2>{form.id ? 'Edit Domain Owner' : 'Add Domain Owner'}</h2>
            <form className='domain-form' onSubmit={submitForm}>
              {!form.id ? (
                <label>
                  Owner Code *
                  <input
                    value={form.owner_code}
                    onChange={(event) => updateFormField('owner_code', event.target.value)}
                    required
                  />
                </label>
              ) : null}
              <label>
                Name *
                <input value={form.name} onChange={(event) => updateFormField('name', event.target.value)} required />
              </label>
              <label>
                Email *
                <input
                  type='email'
                  value={form.email}
                  onChange={(event) => updateFormField('email', event.target.value)}
                  required
                />
              </label>
              <label>
                Password {form.id ? '(optional)' : '*'}
                <input
                  type='password'
                  value={form.password}
                  onChange={(event) => updateFormField('password', event.target.value)}
                  required={!form.id}
                />
              </label>
              <label>
                Secondary Password (6 digits) {form.id ? '(optional)' : '*'}
                <input
                  value={form.secondary_password}
                  onChange={(event) => updateFormField('secondary_password', event.target.value.replace(/\D/g, '').slice(0, 6))}
                  required={!form.id}
                  maxLength={6}
                />
              </label>

              <div className='domain-company-editor'>
                <div className='domain-company-editor-head'>
                  <strong>Companies</strong>
                  <button type='button' onClick={addCompanyRow}>
                    + Add Company
                  </button>
                </div>
                {form.companies.map((company, index) => (
                  <div className='domain-company-row' key={`${index}-${company.company_id || 'new'}`}>
                    <input
                      placeholder='Company ID'
                      value={company.company_id}
                      onChange={(event) => updateCompanyField(index, 'company_id', event.target.value.toUpperCase())}
                    />
                    <input
                      type='date'
                      value={company.expiration_date || ''}
                      onChange={(event) => updateCompanyField(index, 'expiration_date', event.target.value)}
                    />
                    <input
                      placeholder='Group ID'
                      value={company.group_id || ''}
                      onChange={(event) => updateCompanyField(index, 'group_id', event.target.value.toUpperCase())}
                    />
                    <div className='domain-company-perms'>
                      {PERMISSION_OPTIONS.map((permission) => (
                        <label key={`${index}-${permission}`}>
                          <input
                            type='checkbox'
                            checked={(company.permissions || []).includes(permission)}
                            onChange={() => toggleCompanyPermission(index, permission)}
                          />
                          <span>{permission}</span>
                        </label>
                      ))}
                    </div>
                    <div className='domain-company-row-actions'>
                      {company.company_id ? (
                        <button type='button' onClick={() => openShareModal(company.company_id)}>
                          Share %
                        </button>
                      ) : null}
                      <button type='button' className='danger' onClick={() => removeCompanyRow(index)}>
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className='domain-form-actions'>
                <button type='button' onClick={() => setModalOpen(false)} disabled={saving}>
                  Cancel
                </button>
                <button type='submit' disabled={saving}>
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {shareModalOpen ? (
        <div className='domain-modal-mask' onClick={() => (!shareSaving ? setShareModalOpen(false) : null)}>
          <div className='domain-modal domain-share-modal' onClick={(event) => event.stopPropagation()}>
            <h2>Share Settings: {shareCompanyCode}</h2>
            <label className='domain-share-toggle'>
              <input
                type='checkbox'
                checked={applyCommissionPayments}
                onChange={(event) => setApplyCommissionPayments(event.target.checked)}
              />
              <span>Create payment entries on save</span>
            </label>
            {['sales', 'cs', 'it'].map((role) => (
              <section className='domain-share-role' key={role}>
                <div className='domain-share-role-head'>
                  <strong>{role.toUpperCase()}</strong>
                  <button type='button' onClick={() => addShareRow(role)}>
                    + Add
                  </button>
                </div>
                <div className='domain-share-rows'>
                  {(shareData[role] || []).map((row, index) => (
                    <div className='domain-share-row' key={`${role}-${index}`}>
                      <select
                        value={String(row.account_id || '')}
                        onChange={(event) => updateShareRow(role, index, 'account_id', Number(event.target.value) || 0)}
                      >
                        <option value=''>Select Account</option>
                        {shareAccounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.account_id} {account.name ? `- ${account.name}` : ''}
                          </option>
                        ))}
                      </select>
                      <input
                        value={row.percentage ?? ''}
                        onChange={(event) => updateShareRow(role, index, 'percentage', event.target.value)}
                        placeholder='%'
                        inputMode='decimal'
                      />
                      <button type='button' className='danger' onClick={() => removeShareRow(role, index)}>
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            ))}
            <div className='domain-form-actions'>
              <button type='button' onClick={() => setShareModalOpen(false)} disabled={shareSaving}>
                Cancel
              </button>
              <button type='button' onClick={saveShareSettings} disabled={shareSaving}>
                {shareSaving ? 'Saving...' : 'Save Share Settings'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

export default DomainPage
