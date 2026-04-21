const API_BASE = import.meta.env.VITE_API_BASE || ''

export const announcementApi = {
  announcementList: `${API_BASE}/api/announcements/announcement_list_api.php`,
  announcementCreate: `${API_BASE}/api/announcements/announcement_create_api.php`,
  announcementUpdate: `${API_BASE}/api/announcements/announcement_update_api.php`,
  announcementDelete: `${API_BASE}/api/announcements/announcement_delete_api.php`,
  maintenanceList: `${API_BASE}/api/maintenance/list_api.php`,
  maintenanceCreate: `${API_BASE}/api/maintenance/create_api.php`,
  maintenanceUpdate: `${API_BASE}/api/maintenance/update_api.php`,
  maintenanceDelete: `${API_BASE}/api/maintenance/delete_api.php`,
}

export async function getJson(url) {
  const response = await fetch(url, {
    credentials: 'same-origin',
  })

  const json = await response.json()
  if (!response.ok || !json.success) {
    throw new Error(json.message || 'API request failed')
  }
  return json
}

export async function postForm(url, payload) {
  const formData = new FormData()
  Object.entries(payload).forEach(([key, value]) => {
    formData.append(key, String(value))
  })

  const response = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    body: formData,
  })

  const json = await response.json()
  if (!response.ok || !json.success) {
    throw new Error(json.message || 'API request failed')
  }
  return json
}
