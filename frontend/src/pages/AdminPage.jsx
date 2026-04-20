import { useEffect, useMemo, useState } from 'react'
import './AdminPage.css'

const API_BASE = import.meta.env.VITE_API_BASE || ''
const API = {
  userList: `${API_BASE}/api/users/userlist_api.php`,
  toggleStatus: `${API_BASE}/api/users/toggle_status_api.php`,
}

const TABLE_COLUMNS = ['No', 'Login Id', 'Name', 'Email', 'Role', 'Status', 'Last Login', 'Created By', 'Select']
const ROWS_PER_PAGE = 20
const ROLE_OPTIONS = ['partnership', 'admin', 'manager', 'supervisor', 'accountant', 'audit', 'customer service', 'company']

async function postJson(url, payload) {
  const response = await fetch(url, {
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

function toDisplayDate(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function normalizeUser(item) {
  return {
    id: Number(item.id),
    login_id: item.login_id || '',
    name: item.name || '',
    email: item.email || '',
    role: (item.role || '').toLowerCase(),
    status: (item.status || '').toLowerCase(),
    created_by: item.created_by || '-',
    last_login: item.last_login || '',
  }
}

function AdminPage() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [sortBy, setSortBy] = useState('login_id')
  const [sortDirection, setSortDirection] = useState('asc')
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedIds, setSelectedIds] = useState([])
  const [modalOpen, setModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    login_id: '',
    name: '',
    email: '',
    role: 'manager',
    status: 'active',
    password: '',
    secondary_password: '',
  })

  const resetMessages = () => {
    setError('')
    setNotice('')
  }

  const loadUsers = async () => {
    try {
      setLoading(true)
      resetMessages()
      const result = await postJson(API.userList, { action: 'get' })
      const list = Array.isArray(result.data) ? result.data.map(normalizeUser) : []
      setUsers(list)
      setSelectedIds([])
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadUsers()
  }, [])

  const filteredUsers = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase()
    let list = users.filter((user) => {
      const matchKeyword =
        !keyword ||
        user.login_id.toLowerCase().includes(keyword) ||
        user.name.toLowerCase().includes(keyword) ||
        user.email.toLowerCase().includes(keyword)

      if (showAll) return matchKeyword
      if (showInactive) return matchKeyword && user.status === 'inactive'
      return matchKeyword && user.status !== 'inactive'
    })

    list = [...list].sort((a, b) => {
      const factor = sortDirection === 'asc' ? 1 : -1
      if (sortBy === 'role') {
        return a.role.localeCompare(b.role) * factor
      }
      return a.login_id.localeCompare(b.login_id) * factor
    })

    return list
  }, [users, searchTerm, showInactive, showAll, sortBy, sortDirection])

  const totalPages = showAll ? 1 : Math.max(1, Math.ceil(filteredUsers.length / ROWS_PER_PAGE))

  const pagedUsers = useMemo(() => {
    if (showAll) return filteredUsers
    const start = (currentPage - 1) * ROWS_PER_PAGE
    return filteredUsers.slice(start, start + ROWS_PER_PAGE)
  }, [filteredUsers, currentPage, showAll])

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
    setEditingUser(null)
    setForm({
      login_id: '',
      name: '',
      email: '',
      role: 'manager',
      status: 'active',
      password: '',
      secondary_password: '',
    })
    setModalOpen(true)
  }

  const openEditModal = (user) => {
    setEditingUser(user)
    setForm({
      login_id: user.login_id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status || 'active',
      password: '',
      secondary_password: '',
    })
    setModalOpen(true)
  }

  const closeModal = () => {
    if (!submitting) setModalOpen(false)
  }

  const handleSave = async (event) => {
    event.preventDefault()
    resetMessages()
    if (!editingUser && !form.password.trim()) {
      setError('Password is required for new user')
      return
    }

    const payload = {
      action: editingUser ? 'update' : 'create',
      login_id: form.login_id.trim().toUpperCase(),
      name: form.name.trim().toUpperCase(),
      email: form.email.trim().toLowerCase(),
      role: form.role,
      status: form.status,
    }

    if (editingUser) payload.id = editingUser.id
    if (form.password.trim()) payload.password = form.password
    if (form.secondary_password.trim()) payload.secondary_password = form.secondary_password.trim()

    try {
      setSubmitting(true)
      await postJson(API.userList, payload)
      setNotice(editingUser ? 'User updated successfully' : 'User created successfully')
      setModalOpen(false)
      await loadUsers()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  const toggleUserStatus = async (user) => {
    try {
      resetMessages()
      const formData = new FormData()
      formData.append('id', String(user.id))
      const response = await fetch(API.toggleStatus, {
        method: 'POST',
        credentials: 'same-origin',
        body: formData,
      })
      const json = await response.json()
      if (!response.ok || !json.success) {
        throw new Error(json.error || json.message || 'Failed to toggle status')
      }
      setUsers((prev) =>
        prev.map((item) =>
          item.id === user.id ? { ...item, status: json.data?.newStatus || item.status } : item,
        ),
      )
      setNotice('Status updated')
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  const handleDeleteSelected = async () => {
    if (selectedIds.length === 0) return
    if (!window.confirm(`Delete ${selectedIds.length} selected user(s)?`)) return
    resetMessages()

    try {
      const results = await Promise.all(
        selectedIds.map(async (id) => {
          try {
            await postJson(API.userList, { action: 'delete', id })
            return { id, success: true }
          } catch (requestError) {
            return { id, success: false, message: requestError.message }
          }
        }),
      )
      const successIds = results.filter((item) => item.success).map((item) => item.id)
      const failCount = results.length - successIds.length

      if (successIds.length > 0) {
        setUsers((prev) => prev.filter((item) => !successIds.includes(item.id)))
      }
      setSelectedIds([])
      if (failCount > 0) {
        setError(`Deleted ${successIds.length}, failed ${failCount}`)
      } else {
        setNotice(`Deleted ${successIds.length} user(s)`)
      }
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  const allPageIds = pagedUsers.filter((user) => user.status === 'inactive').map((user) => user.id)
  const allChecked = allPageIds.length > 0 && allPageIds.every((id) => selectedIds.includes(id))

  return (
    <section className='admin-page'>
      <header className='admin-header'>
        <h1>User List</h1>
      </header>
      <div className='admin-separator' />

      {error ? <div className='admin-message admin-message-error'>{error}</div> : null}
      {notice ? <div className='admin-message admin-message-success'>{notice}</div> : null}

      <div className='admin-toolbar'>
        <div className='admin-toolbar-left'>
          <button type='button' className='admin-btn admin-btn-primary' onClick={openCreateModal}>
            Add User
          </button>
          <input
            type='text'
            className='admin-search'
            value={searchTerm}
            onChange={(event) => {
              setSearchTerm(event.target.value)
              setCurrentPage(1)
            }}
            placeholder='Search by Login Id or Name'
          />
          <label className='admin-checkbox'>
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
          <label className='admin-checkbox'>
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
          className='admin-btn admin-btn-danger'
          disabled={selectedIds.length === 0}
          onClick={handleDeleteSelected}
        >
          {selectedIds.length > 0 ? `Delete (${selectedIds.length})` : 'Delete'}
        </button>
      </div>

      <div className='admin-table-wrap'>
        <div className='admin-table-head'>
          {TABLE_COLUMNS.map((col) => (
            <div
              key={col}
              className={`admin-th ${col === 'Login Id' || col === 'Role' ? 'admin-th-sort' : ''}`}
              onClick={() => {
                if (col === 'Login Id') toggleSort('login_id')
                if (col === 'Role') toggleSort('role')
              }}
            >
              {col}
              {col === 'Login Id' && sortBy === 'login_id' ? ` ${sortDirection === 'asc' ? '▲' : '▼'}` : ''}
              {col === 'Role' && sortBy === 'role' ? ` ${sortDirection === 'asc' ? '▲' : '▼'}` : ''}
            </div>
          ))}
        </div>

        {loading ? <div className='admin-empty'>Loading...</div> : null}
        {!loading && pagedUsers.length === 0 ? <div className='admin-empty'>No users found.</div> : null}
        {!loading && pagedUsers.length > 0 ? (
          <div className='admin-table-body'>
            {pagedUsers.map((user, index) => (
              <div className='admin-row' key={user.id}>
                <div>{showAll ? index + 1 : (currentPage - 1) * ROWS_PER_PAGE + index + 1}</div>
                <div>{user.login_id}</div>
                <div>{user.name}</div>
                <div>{user.email || '-'}</div>
                <div className='admin-role'>{user.role.toUpperCase()}</div>
                <div>
                  <button
                    type='button'
                    className={`admin-status admin-status-${user.status}`}
                    onClick={() => toggleUserStatus(user)}
                  >
                    {user.status.toUpperCase()}
                  </button>
                </div>
                <div>{toDisplayDate(user.last_login)}</div>
                <div>{String(user.created_by || '-').toUpperCase()}</div>
                <div className='admin-row-actions'>
                  <button type='button' className='admin-icon-btn' onClick={() => openEditModal(user)}>
                    Edit
                  </button>
                  {user.status === 'inactive' ? (
                    <input
                      type='checkbox'
                      checked={selectedIds.includes(user.id)}
                      onChange={(event) => {
                        setSelectedIds((prev) =>
                          event.target.checked ? [...prev, user.id] : prev.filter((id) => id !== user.id),
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

      {!showAll && filteredUsers.length > 0 ? (
        <div className='admin-pagination'>
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
          <label className='admin-checkbox admin-selectall'>
            <input
              type='checkbox'
              checked={allChecked}
              onChange={(event) => {
                if (event.target.checked) {
                  setSelectedIds((prev) => Array.from(new Set([...prev, ...allPageIds])))
                } else {
                  setSelectedIds((prev) => prev.filter((id) => !allPageIds.includes(id)))
                }
              }}
            />
            <span>Select page inactive</span>
          </label>
        </div>
      ) : null}

      {modalOpen ? (
        <div className='admin-modal-mask' onClick={closeModal}>
          <div className='admin-modal' onClick={(event) => event.stopPropagation()}>
            <h2>{editingUser ? 'Edit User' : 'Add User'}</h2>
            <form className='admin-form' onSubmit={handleSave}>
              <label>
                Login ID *
                <input
                  value={form.login_id}
                  disabled={Boolean(editingUser)}
                  onChange={(event) => setForm((prev) => ({ ...prev, login_id: event.target.value }))}
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
                Email *
                <input
                  type='email'
                  value={form.email}
                  onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
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
                Password {editingUser ? '(leave blank to keep)' : '*'}
                <input
                  type='password'
                  value={form.password}
                  onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                />
              </label>
              <label>
                Secondary Password (6 digits)
                <input
                  value={form.secondary_password}
                  maxLength={6}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, secondary_password: event.target.value.replace(/\D/g, '') }))
                  }
                />
              </label>
              <div className='admin-form-actions'>
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

export default AdminPage
