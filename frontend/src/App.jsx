import { useEffect, useMemo, useState } from 'react'
import Sidebar from './components/Sidebar'
import AdminPage from './pages/AdminPage'
import AccountPage from './pages/AccountPage'
import ProcessPage from './pages/ProcessPage'
import DashboardPage from './pages/DashboardPage'
import { API, getJson, postForm } from './lib/apiClient'
import './App.css'

function App() {
  const [currentRoute, setCurrentRoute] = useState(window.location.hash || '#/dashboard')
  const [authLoading, setAuthLoading] = useState(true)
  const [authError, setAuthError] = useState('')
  const [currentUser, setCurrentUser] = useState(null)
  const [activeTab, setActiveTab] = useState('announcement')
  const [announcements, setAnnouncements] = useState([])
  const [maintenanceList, setMaintenanceList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [announcementTitle, setAnnouncementTitle] = useState('')
  const [announcementContent, setAnnouncementContent] = useState('')
  const [maintenanceContent, setMaintenanceContent] = useState('')
  const [editingAnnouncement, setEditingAnnouncement] = useState(null)
  const [editingMaintenance, setEditingMaintenance] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)
  const [deletingId, setDeletingId] = useState(null)

  useEffect(() => {
    const onHashChange = () => setCurrentRoute(window.location.hash || '#/dashboard')
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  useEffect(() => {
    let disposed = false
    const bootstrapAuth = async () => {
      try {
        const authRes = await getJson(API.authMe)
        if (!disposed) {
          setCurrentUser(authRes.data || null)
        }
      } catch (err) {
        if (!disposed) {
          setAuthError(err.message)
        }
      } finally {
        if (!disposed) setAuthLoading(false)
      }
    }
    bootstrapAuth()
    return () => {
      disposed = true
    }
  }, [])

  const resetMessages = () => {
    setError('')
    setNotice('')
  }

  const loadData = async () => {
    try {
      setLoading(true)
      setError('')
      const [announcementRes, maintenanceRes] = await Promise.all([
        getJson(API.announcementList),
        getJson(API.maintenanceList),
      ])
      setAnnouncements(Array.isArray(announcementRes.data) ? announcementRes.data : [])
      setMaintenanceList(Array.isArray(maintenanceRes.data) ? maintenanceRes.data : [])
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadData()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  const maintenanceExists = useMemo(() => maintenanceList.length > 0, [maintenanceList])

  const submitAnnouncement = async (event) => {
    event.preventDefault()
    resetMessages()
    const title = announcementTitle.trim()
    const content = announcementContent.trim()

    if (!title || !content) {
      setError('Please fill in both title and content')
      return
    }

    try {
      setSubmitting(true)
      await postForm(API.announcementCreate, { title, content })
      setNotice('Announcement published successfully')
      setAnnouncementTitle('')
      setAnnouncementContent('')
      await loadData()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  const submitMaintenance = async (event) => {
    event.preventDefault()
    resetMessages()
    const content = maintenanceContent.trim()
    if (!content) {
      setError('Please fill in the content')
      return
    }
    try {
      setSubmitting(true)
      await postForm(API.maintenanceCreate, { content })
      setNotice('Maintenance content published successfully')
      setMaintenanceContent('')
      await loadData()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  const deleteAnnouncement = async (id) => {
    if (!window.confirm('Are you sure you want to delete this announcement? This action cannot be undone.')) {
      return
    }
    resetMessages()
    try {
      setDeletingId(id)
      await postForm(API.announcementDelete, { id })
      setNotice('Announcement deleted successfully')
      await loadData()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setDeletingId(null)
    }
  }

  const deleteMaintenance = async (id) => {
    if (!window.confirm('Are you sure you want to delete this maintenance content? This action cannot be undone.')) {
      return
    }
    resetMessages()
    try {
      setDeletingId(id)
      await postForm(API.maintenanceDelete, { id })
      setNotice('Maintenance content deleted successfully')
      await loadData()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setDeletingId(null)
    }
  }

  const saveAnnouncementEdit = async (event) => {
    event.preventDefault()
    if (!editingAnnouncement) return
    resetMessages()
    const title = editingAnnouncement.title.trim()
    const content = editingAnnouncement.content.trim()
    if (!title || !content) {
      setError('Please fill in both title and content')
      return
    }
    try {
      setSavingEdit(true)
      await postForm(API.announcementUpdate, {
        id: editingAnnouncement.id,
        title,
        content,
      })
      setNotice('Announcement updated successfully')
      setEditingAnnouncement(null)
      await loadData()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSavingEdit(false)
    }
  }

  const saveMaintenanceEdit = async (event) => {
    event.preventDefault()
    if (!editingMaintenance) return
    resetMessages()
    const content = editingMaintenance.content.trim()
    if (!content) {
      setError('Please fill in the content')
      return
    }
    try {
      setSavingEdit(true)
      await postForm(API.maintenanceUpdate, {
        id: editingMaintenance.id,
        content,
      })
      setNotice('Maintenance content updated successfully')
      setEditingMaintenance(null)
      await loadData()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSavingEdit(false)
    }
  }

  return (
    <div className="app-layout">
      <Sidebar currentRoute={currentRoute} currentUser={currentUser} />
      <main className="app-content">
        {authLoading ? <p>Checking session...</p> : null}
        {!authLoading && authError ? <div className="message error">{authError}</div> : null}
        {!authLoading && !authError && currentRoute === '#/admin' ? (
          <AdminPage />
        ) : !authLoading && !authError && currentRoute === '#/account' ? (
          <AccountPage />
        ) : !authLoading && !authError && currentRoute === '#/process' ? (
          <ProcessPage />
        ) : !authLoading && !authError && currentRoute === '#/dashboard' ? (
          <DashboardPage />
        ) : (
          <section className="announcement-page">
            <header className="page-header">
              <h1>Announcement and Maintenance Management</h1>
              <div className="page-tabs">
                <button
                  type="button"
                  className={activeTab === 'announcement' ? 'active' : ''}
                  onClick={() => setActiveTab('announcement')}
                >
                  Announcement
                </button>
                <button
                  type="button"
                  className={activeTab === 'maintenance' ? 'active' : ''}
                  onClick={() => setActiveTab('maintenance')}
                >
                  Maintenance
                </button>
              </div>
            </header>

            {error ? <div className="message error">{error}</div> : null}
            {notice ? <div className="message success">{notice}</div> : null}
            {activeTab === 'announcement' ? (
              <section className="split-layout">
                <article className="panel">
                  <h2>Create New Announcement</h2>
                  <form onSubmit={submitAnnouncement} className="entity-form">
                    <label>
                      Title *
                      <input
                        value={announcementTitle}
                        onChange={(event) => setAnnouncementTitle(event.target.value)}
                        maxLength={500}
                        required
                        placeholder="Enter announcement title"
                      />
                    </label>
                    <label>
                      Content *
                      <textarea
                        value={announcementContent}
                        onChange={(event) => setAnnouncementContent(event.target.value)}
                        rows={8}
                        required
                        placeholder="Enter announcement content"
                      />
                    </label>
                    <button type="submit" disabled={submitting}>
                      {submitting ? 'Publishing...' : 'Publish Announcement'}
                    </button>
                  </form>
                </article>

                <article className="panel">
                  <h2>Published Announcements</h2>
                  {loading ? <p>Loading...</p> : null}
                  {!loading && announcements.length === 0 ? (
                    <p className="empty-state">No announcements</p>
                  ) : null}
                  <div className="card-list">
                    {announcements.map((item) => (
                      <div className="item-card" key={item.id}>
                        <div className="item-card-head">
                          <h3>{item.title}</h3>
                          <div className="row-actions">
                            <button
                              type="button"
                              onClick={() =>
                                setEditingAnnouncement({
                                  id: item.id,
                                  title: item.title,
                                  content: item.content,
                                })
                              }
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteAnnouncement(item.id)}
                              disabled={deletingId === item.id}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                        <pre className="content-text">{item.content}</pre>
                        <div className="meta-row">
                          <span>Created by: {item.created_by}</span>
                          <span>Created at: {item.created_at}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </article>
              </section>
            ) : null}

            {activeTab === 'maintenance' ? (
              <section className="split-layout">
                <article className="panel">
                  <h2>Create New Maintenance Content</h2>
                  {maintenanceExists ? (
                    <div className="message warn">
                      <strong>Notice:</strong> Maintenance content already exists. Please delete
                      the existing content before creating a new one.
                    </div>
                  ) : null}
                  <form onSubmit={submitMaintenance} className="entity-form">
                    <label>
                      Content *
                      <textarea
                        value={maintenanceContent}
                        onChange={(event) => setMaintenanceContent(event.target.value)}
                        rows={8}
                        required
                        disabled={maintenanceExists}
                        placeholder="Enter maintenance content"
                      />
                    </label>
                    <button type="submit" disabled={submitting || maintenanceExists}>
                      {submitting ? 'Publishing...' : 'Publish Maintenance Content'}
                    </button>
                  </form>
                </article>

                <article className="panel">
                  <h2>Published Maintenance Content</h2>
                  {loading ? <p>Loading...</p> : null}
                  {!loading && maintenanceList.length === 0 ? (
                    <p className="empty-state">No maintenance content</p>
                  ) : null}
                  <div className="card-list">
                    {maintenanceList.map((item) => (
                      <div className="item-card" key={item.id}>
                        <div className="item-card-head">
                          <h3>Maintenance</h3>
                          <div className="row-actions">
                            <button
                              type="button"
                              onClick={() =>
                                setEditingMaintenance({
                                  id: item.id,
                                  content: item.content,
                                })
                              }
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteMaintenance(item.id)}
                              disabled={deletingId === item.id}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                        <pre className="content-text">{item.content}</pre>
                        <div className="meta-row">
                          <span>Created by: {item.created_by}</span>
                          <span>Created at: {item.created_at}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </article>
              </section>
            ) : null}

            {editingAnnouncement ? (
              <div className="modal-mask" onClick={() => setEditingAnnouncement(null)}>
                <div className="modal" onClick={(event) => event.stopPropagation()}>
                  <h2>Edit Announcement</h2>
                  <form onSubmit={saveAnnouncementEdit} className="entity-form">
                    <label>
                      Title *
                      <input
                        value={editingAnnouncement.title}
                        onChange={(event) =>
                          setEditingAnnouncement((prev) =>
                            prev ? { ...prev, title: event.target.value } : prev,
                          )
                        }
                        maxLength={500}
                        required
                      />
                    </label>
                    <label>
                      Content *
                      <textarea
                        value={editingAnnouncement.content}
                        onChange={(event) =>
                          setEditingAnnouncement((prev) =>
                            prev ? { ...prev, content: event.target.value } : prev,
                          )
                        }
                        rows={8}
                        required
                      />
                    </label>
                    <div className="form-actions">
                      <button type="button" onClick={() => setEditingAnnouncement(null)}>
                        Cancel
                      </button>
                      <button type="submit" disabled={savingEdit}>
                        {savingEdit ? 'Saving...' : 'Save Changes'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            ) : null}

            {editingMaintenance ? (
              <div className="modal-mask" onClick={() => setEditingMaintenance(null)}>
                <div className="modal" onClick={(event) => event.stopPropagation()}>
                  <h2>Edit Maintenance Content</h2>
                  <form onSubmit={saveMaintenanceEdit} className="entity-form">
                    <label>
                      Content *
                      <textarea
                        value={editingMaintenance.content}
                        onChange={(event) =>
                          setEditingMaintenance((prev) =>
                            prev ? { ...prev, content: event.target.value } : prev,
                          )
                        }
                        rows={8}
                        required
                      />
                    </label>
                    <div className="form-actions">
                      <button type="button" onClick={() => setEditingMaintenance(null)}>
                        Cancel
                      </button>
                      <button type="submit" disabled={savingEdit}>
                        {savingEdit ? 'Saving...' : 'Save Changes'}
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
