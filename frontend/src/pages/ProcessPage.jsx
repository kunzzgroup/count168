import { useEffect, useMemo, useState } from 'react'
import './ProcessPage.css'

const API_BASE = import.meta.env.VITE_API_BASE || ''
const API = {
  list: `${API_BASE}/api/processes/processlist_api.php`,
  form: `${API_BASE}/api/processes/addprocess_api.php`,
  add: `${API_BASE}/api/processes/addprocess_api.php`,
  delete: `${API_BASE}/api/processes/delete_processes_api.php`,
  toggle: `${API_BASE}/api/processes/toggle_process_status_api.php`,
}

const TABLE_COLUMNS = ['No', 'Process ID', 'Description', 'Status', 'Currency', 'Day Use', 'Action']
const ROWS_PER_PAGE = 20

async function getJson(url) {
  const response = await fetch(url, { credentials: 'same-origin' })
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

function normalizeProcess(item) {
  return {
    id: Number(item.id),
    process_name: item.process_name || '',
    description: item.description || '',
    status: (item.status || '').toLowerCase(),
    currency: item.currency || '',
    day_use: item.day_use || '',
    has_transactions: Boolean(item.has_transactions),
  }
}

function ProcessPage() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [sortBy, setSortBy] = useState('process_name')
  const [sortDirection, setSortDirection] = useState('asc')
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedIds, setSelectedIds] = useState([])
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [currencies, setCurrencies] = useState([])
  const [descriptions, setDescriptions] = useState([])
  const [days, setDays] = useState([])
  const [addForm, setAddForm] = useState({
    process_id: '',
    description_id: '',
    currency_id: '',
    remove_word: '',
    replace_word_from: '',
    replace_word_to: '',
    remark: '',
    day_use: [],
  })
  const [editForm, setEditForm] = useState({
    id: '',
    process_name: '',
    description: '',
    selected_descriptions: [],
    currency_id: '',
    remove_word: '',
    replace_word_from: '',
    replace_word_to: '',
    remark: '',
    status: 'active',
    day_use: [],
  })

  const resetMessages = () => {
    setError('')
    setNotice('')
  }

  const loadFormData = async () => {
    const result = await getJson(API.form)
    const payload = result.data || result
    setCurrencies(Array.isArray(payload.currencies) ? payload.currencies : [])
    setDescriptions(Array.isArray(payload.descriptions) ? payload.descriptions : [])
    setDays(Array.isArray(payload.days) ? payload.days : [])
  }

  const loadRows = async () => {
    try {
      setLoading(true)
      resetMessages()
      const params = new URLSearchParams()
      if (searchTerm.trim()) params.set('search', searchTerm.trim())
      if (showInactive) params.set('showInactive', '1')
      if (showAll) params.set('showAll', '1')
      const url = params.toString() ? `${API.list}?${params.toString()}` : API.list
      const result = await getJson(url)
      const list = Array.isArray(result.data) ? result.data.map(normalizeProcess) : []
      setRows(list)
      setSelectedIds([])
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadFormData().catch((err) => setError(err.message))
    loadRows()
  }, [showInactive, showAll])

  const filteredRows = useMemo(() => {
    const keyword = searchTerm.trim().toUpperCase()
    const list = rows.filter((item) => {
      if (!keyword) return true
      return (
        item.process_name.toUpperCase().includes(keyword) ||
        item.description.toUpperCase().includes(keyword) ||
        item.currency.toUpperCase().includes(keyword)
      )
    })

    return [...list].sort((a, b) => {
      const factor = sortDirection === 'asc' ? 1 : -1
      if (sortBy === 'status') {
        return a.status.localeCompare(b.status) * factor
      }
      return a.process_name.localeCompare(b.process_name) * factor
    })
  }, [rows, searchTerm, sortBy, sortDirection])

  const totalPages = showAll ? 1 : Math.max(1, Math.ceil(filteredRows.length / ROWS_PER_PAGE))
  const pagedRows = useMemo(() => {
    if (showAll) return filteredRows
    const start = (currentPage - 1) * ROWS_PER_PAGE
    return filteredRows.slice(start, start + ROWS_PER_PAGE)
  }, [filteredRows, currentPage, showAll])

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

  const openAddModal = () => {
    setAddForm({
      process_id: '',
      description_id: descriptions.length > 0 ? String(descriptions[0].id) : '',
      currency_id: currencies.length > 0 ? String(currencies[0].id) : '',
      remove_word: '',
      replace_word_from: '',
      replace_word_to: '',
      remark: '',
      day_use: [],
    })
    setAddModalOpen(true)
  }

  const openEditModal = async (row) => {
    try {
      resetMessages()
      const result = await getJson(`${API.list}?action=get_process&id=${row.id}`)
      const process = result.data || {}
      const dayIds = process.day_use
        ? String(process.day_use)
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean)
        : []
      setEditForm({
        id: String(process.id || row.id),
        process_name: process.process_name || row.process_name,
        description: process.description_names?.[0] || row.description || '',
        selected_descriptions: process.description_names || [],
        currency_id: process.currency_id ? String(process.currency_id) : '',
        remove_word: process.remove_word || '',
        replace_word_from: process.replace_word_from || '',
        replace_word_to: process.replace_word_to || '',
        remark: process.remarks || '',
        status: process.status || row.status || 'active',
        day_use: dayIds,
      })
      setEditModalOpen(true)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  const toggleStatus = async (row) => {
    try {
      resetMessages()
      const formData = new FormData()
      formData.append('id', String(row.id))
      const response = await fetch(API.toggle, {
        method: 'POST',
        credentials: 'same-origin',
        body: formData,
      })
      const json = await response.json()
      if (!response.ok || !json.success) {
        throw new Error(json.message || json.error || 'Failed to toggle status')
      }
      setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, status: json.data?.newStatus || item.status } : item)))
      setNotice('Status updated')
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  const saveAdd = async (event) => {
    event.preventDefault()
    try {
      setSubmitting(true)
      resetMessages()
      await postForm(API.add, {
        process_id: addForm.process_id.trim().toUpperCase(),
        description_id: addForm.description_id,
        currency_id: addForm.currency_id,
        remove_word: addForm.remove_word,
        replace_word_from: addForm.replace_word_from,
        replace_word_to: addForm.replace_word_to,
        remark: addForm.remark,
        day_use: addForm.day_use.join(','),
      })
      setNotice('Process added successfully')
      setAddModalOpen(false)
      await loadRows()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  const saveEdit = async (event) => {
    event.preventDefault()
    try {
      setSubmitting(true)
      resetMessages()
      await postForm(`${API.list}?action=update_process`, {
        id: editForm.id,
        process_name: editForm.process_name,
        selected_descriptions: JSON.stringify(editForm.selected_descriptions),
        currency_id: editForm.currency_id,
        remove_word: editForm.remove_word,
        replace_word_from: editForm.replace_word_from,
        replace_word_to: editForm.replace_word_to,
        remark: editForm.remark,
        status: editForm.status,
        day_use: editForm.day_use.join(','),
      })
      setNotice('Process updated successfully')
      setEditModalOpen(false)
      await loadRows()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  const deleteSelected = async () => {
    if (selectedIds.length === 0) return
    if (!window.confirm(`Delete ${selectedIds.length} selected process(es)?`)) return
    try {
      resetMessages()
      const result = await postJson(API.delete, { ids: selectedIds })
      setNotice(result.message || 'Deleted')
      await loadRows()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  const inactiveIdsOnPage = pagedRows
    .filter((item) => item.status === 'inactive' && !item.has_transactions)
    .map((item) => item.id)
  const allChecked =
    inactiveIdsOnPage.length > 0 && inactiveIdsOnPage.every((processId) => selectedIds.includes(processId))

  return (
    <section className='process-react-page'>
      <header className='process-react-header'>
        <h1>Process List</h1>
      </header>
      <div className='process-react-separator' />

      {error ? <div className='process-react-message process-react-message-error'>{error}</div> : null}
      {notice ? <div className='process-react-message process-react-message-success'>{notice}</div> : null}

      <div className='process-react-toolbar'>
        <div className='process-react-toolbar-left'>
          <button type='button' className='process-react-btn process-react-btn-primary' onClick={openAddModal}>
            Add Process
          </button>
          <input
            type='text'
            className='process-react-search'
            placeholder='Search'
            value={searchTerm}
            onChange={(event) => {
              setSearchTerm(event.target.value)
              setCurrentPage(1)
            }}
          />
          <label className='process-react-checkbox'>
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
          <label className='process-react-checkbox'>
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
        </div>
        <button
          type='button'
          className='process-react-btn process-react-btn-danger'
          disabled={selectedIds.length === 0}
          onClick={deleteSelected}
        >
          {selectedIds.length > 0 ? `Delete (${selectedIds.length})` : 'Delete'}
        </button>
      </div>

      <div className='process-react-table-wrap'>
        <div className='process-react-table-head'>
          {TABLE_COLUMNS.map((col) => (
            <div
              key={col}
              className={`process-react-th ${col === 'Process ID' || col === 'Status' ? 'process-react-th-sort' : ''}`}
              onClick={() => {
                if (col === 'Process ID') toggleSort('process_name')
                if (col === 'Status') toggleSort('status')
              }}
            >
              {col}
              {col === 'Process ID' && sortBy === 'process_name' ? ` ${sortDirection === 'asc' ? '▲' : '▼'}` : ''}
              {col === 'Status' && sortBy === 'status' ? ` ${sortDirection === 'asc' ? '▲' : '▼'}` : ''}
            </div>
          ))}
        </div>

        {loading ? <div className='process-react-empty'>Loading...</div> : null}
        {!loading && pagedRows.length === 0 ? <div className='process-react-empty'>No process data found.</div> : null}
        {!loading && pagedRows.length > 0 ? (
          <div className='process-react-table-body'>
            {pagedRows.map((item, index) => (
              <div className='process-react-row' key={item.id}>
                <div>{showAll ? index + 1 : (currentPage - 1) * ROWS_PER_PAGE + index + 1}</div>
                <div>{item.process_name}</div>
                <div>{item.description}</div>
                <div>
                  <button
                    type='button'
                    className={`process-react-status process-react-status-${item.status}`}
                    onClick={() => toggleStatus(item)}
                  >
                    {item.status.toUpperCase()}
                  </button>
                </div>
                <div>{item.currency || '-'}</div>
                <div>{item.day_use || '-'}</div>
                <div className='process-react-actions'>
                  <button type='button' className='process-react-icon-btn' onClick={() => openEditModal(item)}>
                    Edit
                  </button>
                  {item.status === 'inactive' && !item.has_transactions ? (
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

      {!showAll && filteredRows.length > 0 ? (
        <div className='process-react-pagination'>
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
          <label className='process-react-checkbox process-react-selectall'>
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

      {addModalOpen ? (
        <div className='process-react-modal-mask' onClick={() => setAddModalOpen(false)}>
          <div className='process-react-modal' onClick={(event) => event.stopPropagation()}>
            <h2>Add Process</h2>
            <form className='process-react-form' onSubmit={saveAdd}>
              <label>
                Process ID *
                <input
                  value={addForm.process_id}
                  onChange={(event) => setAddForm((prev) => ({ ...prev, process_id: event.target.value }))}
                  required
                />
              </label>
              <label>
                Description *
                <select
                  value={addForm.description_id}
                  onChange={(event) => setAddForm((prev) => ({ ...prev, description_id: event.target.value }))}
                  required
                >
                  <option value=''>Select Description</option>
                  {descriptions.map((desc) => (
                    <option key={desc.id} value={desc.id}>
                      {desc.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Currency *
                <select
                  value={addForm.currency_id}
                  onChange={(event) => setAddForm((prev) => ({ ...prev, currency_id: event.target.value }))}
                  required
                >
                  <option value=''>Select Currency</option>
                  {currencies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Day Use
                <div className='process-react-day-grid'>
                  {days.map((day) => (
                    <label key={day.id} className='process-react-day-item'>
                      <input
                        type='checkbox'
                        checked={addForm.day_use.includes(String(day.id))}
                        onChange={(event) => {
                          setAddForm((prev) => ({
                            ...prev,
                            day_use: event.target.checked
                              ? [...prev.day_use, String(day.id)]
                              : prev.day_use.filter((id) => id !== String(day.id)),
                          }))
                        }}
                      />
                      <span>{day.day_name}</span>
                    </label>
                  ))}
                </div>
              </label>
              <label>
                Remove Words
                <input
                  value={addForm.remove_word}
                  onChange={(event) => setAddForm((prev) => ({ ...prev, remove_word: event.target.value }))}
                />
              </label>
              <label>
                Replace From
                <input
                  value={addForm.replace_word_from}
                  onChange={(event) => setAddForm((prev) => ({ ...prev, replace_word_from: event.target.value }))}
                />
              </label>
              <label>
                Replace To
                <input
                  value={addForm.replace_word_to}
                  onChange={(event) => setAddForm((prev) => ({ ...prev, replace_word_to: event.target.value }))}
                />
              </label>
              <label>
                Remark
                <textarea
                  rows={2}
                  value={addForm.remark}
                  onChange={(event) => setAddForm((prev) => ({ ...prev, remark: event.target.value }))}
                />
              </label>
              <div className='process-react-form-actions'>
                <button type='button' onClick={() => setAddModalOpen(false)} disabled={submitting}>
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

      {editModalOpen ? (
        <div className='process-react-modal-mask' onClick={() => setEditModalOpen(false)}>
          <div className='process-react-modal' onClick={(event) => event.stopPropagation()}>
            <h2>Edit Process</h2>
            <form className='process-react-form' onSubmit={saveEdit}>
              <label>
                Process ID *
                <input value={editForm.process_name} disabled />
              </label>
              <label>
                Description
                <input value={editForm.description} disabled />
              </label>
              <label>
                Currency
                <select
                  value={editForm.currency_id}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, currency_id: event.target.value }))}
                >
                  <option value=''>Select Currency</option>
                  {currencies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Status
                <select
                  value={editForm.status}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, status: event.target.value }))}
                >
                  <option value='active'>active</option>
                  <option value='inactive'>inactive</option>
                </select>
              </label>
              <label>
                Day Use
                <div className='process-react-day-grid'>
                  {days.map((day) => (
                    <label key={day.id} className='process-react-day-item'>
                      <input
                        type='checkbox'
                        checked={editForm.day_use.includes(String(day.id))}
                        onChange={(event) => {
                          setEditForm((prev) => ({
                            ...prev,
                            day_use: event.target.checked
                              ? [...prev.day_use, String(day.id)]
                              : prev.day_use.filter((id) => id !== String(day.id)),
                          }))
                        }}
                      />
                      <span>{day.day_name}</span>
                    </label>
                  ))}
                </div>
              </label>
              <label>
                Remove Words
                <input
                  value={editForm.remove_word}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, remove_word: event.target.value }))}
                />
              </label>
              <label>
                Replace From
                <input
                  value={editForm.replace_word_from}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, replace_word_from: event.target.value }))}
                />
              </label>
              <label>
                Replace To
                <input
                  value={editForm.replace_word_to}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, replace_word_to: event.target.value }))}
                />
              </label>
              <label>
                Remark
                <textarea
                  rows={2}
                  value={editForm.remark}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, remark: event.target.value }))}
                />
              </label>
              <div className='process-react-form-actions'>
                <button type='button' onClick={() => setEditModalOpen(false)} disabled={submitting}>
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

export default ProcessPage
