const API_BASE = import.meta.env.VITE_API_BASE || ''

export const API = {
  authMe: `${API_BASE}/api/auth/me.php`,
  authLogout: `${API_BASE}/api/auth/logout.php`,
  dashboardSummary: `${API_BASE}/api/dashboard/summary.php`,
  sidebarContext: `${API_BASE}/api/navigation/sidebar-context.php`,
  announcementList: `${API_BASE}/api/announcements/announcement_list_api.php`,
  announcementCreate: `${API_BASE}/api/announcements/announcement_create_api.php`,
  announcementUpdate: `${API_BASE}/api/announcements/announcement_update_api.php`,
  announcementDelete: `${API_BASE}/api/announcements/announcement_delete_api.php`,
  maintenanceList: `${API_BASE}/api/maintenance/list_api.php`,
  maintenanceCreate: `${API_BASE}/api/maintenance/create_api.php`,
  maintenanceUpdate: `${API_BASE}/api/maintenance/update_api.php`,
  maintenanceDelete: `${API_BASE}/api/maintenance/delete_api.php`,
}

function toErrorMessage(body, fallback) {
  if (!body || typeof body !== 'object') return fallback
  return body.message || body.error || fallback
}

export async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'include',
    ...options,
  })

  let body = null
  try {
    body = await response.json()
  } catch {
    throw new Error('Invalid JSON response')
  }

  const isSuccess = body?.success === true || String(body?.code || '').startsWith('OK')
  if (!response.ok || !isSuccess) {
    throw new Error(toErrorMessage(body, 'API request failed'))
  }
  return body
}

export async function getJson(url) {
  return requestJson(url)
}

export async function postForm(url, payload) {
  const formData = new FormData()
  Object.entries(payload).forEach(([key, value]) => {
    formData.append(key, String(value))
  })
  return requestJson(url, { method: 'POST', body: formData })
}

export async function postJson(url, payload) {
  return requestJson(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
}

