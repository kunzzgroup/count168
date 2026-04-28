import { buildApiUrl } from "../../../utils/apiUrl.js";

/**
 * Fetch permissions for a specific company
 */
export async function fetchCompanyPermissions(companyCode) {
  if (!companyCode) return [];
  try {
    const response = await fetch(buildApiUrl("api/domain/domain_api.php"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "get_company_permissions", company_id: companyCode })
    });
    const result = await response.json();
    if (result.success && result.data && Array.isArray(result.data.permissions)) {
      return result.data.permissions;
    }
    // Default fallback if API fails or returns no permissions
    return ['Games', 'Bank', 'Loan', 'Rate', 'Money'];
  } catch (err) {
    console.error("Error fetching company permissions:", err);
    return ['Games', 'Bank', 'Loan', 'Rate', 'Money'];
  }
}

/**
 * Fetch process list for a specific company
 */
export async function fetchProcesses(companyId) {
  const params = new URLSearchParams();
  if (companyId) {
    params.append("company_id", companyId);
  }
  const url = buildApiUrl(`api/processes/processlist_api.php?${params.toString()}`);
  
  const response = await fetch(url);
  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error || 'Failed to load process list');
  }
  return data.data || [];
}

/**
 * Search capture data
 */
export async function searchCaptureData({ dateFrom, dateTo, process, companyId }) {
  const params = new URLSearchParams();
  params.append("date_from", dateFrom);
  params.append("date_to", dateTo);
  if (process) {
    params.append("process", process);
  }
  if (companyId) {
    params.append("company_id", companyId);
  }
  
  const url = buildApiUrl(`api/capture_maintenance/search_api.php?${params.toString()}`);
  const response = await fetch(url);
  const data = await response.json();
  
  if (!data.success) {
    throw new Error(data.message || data.error || 'Search failed');
  }
  return data.data || [];
}

/**
 * Delete selected capture items
 */
export async function deleteCaptureItems({ items, dateFrom, dateTo }) {
  const payload = {
    date_from: dateFrom,
    date_to: dateTo,
    items: items
  };
  
  const response = await fetch(buildApiUrl('api/capture_maintenance/delete_api.php'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload)
  });
  
  const data = await response.json();
  if (!data.success) {
    throw new Error(data.message || data.error || 'Delete failed');
  }
  return data;
}

/**
 * Update session company
 */
export async function updateSessionCompany(companyId) {
  const response = await fetch(buildApiUrl(`api/session/update_company_session_api.php?company_id=${companyId}`));
  const result = await response.json();
  if (!result.success) {
    throw new Error(result.error || 'Failed to update session company');
  }
  return result.data;
}

/**
 * Escape HTML special characters
 */
export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
