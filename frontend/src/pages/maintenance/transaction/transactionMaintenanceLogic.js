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
      credentials: "include",
      body: JSON.stringify({ action: "get_company_permissions", company_id: companyCode })
    });
    const result = await response.json();
    if (result.success && result.data && Array.isArray(result.data.permissions)) {
      return result.data.permissions;
    }
  } catch (err) {
    console.error("Error fetching company permissions:", err);
  }
  return ['Games', 'Bank', 'Loan', 'Rate', 'Money'];
}

/**
 * Check if the company only has Bank permissions (legacy redirect rule)
 */
export function isBankOnlyCategoryCompany(permissions) {
  if (!Array.isArray(permissions) || permissions.length === 0) return false;
  const hasBank = permissions.includes('Bank');
  const hasGames = permissions.includes('Games') || permissions.includes('Gambling');
  return hasBank && !hasGames;
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
  
  const response = await fetch(url, { credentials: "include" });
  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error || 'Failed to load process list');
  }
  return data.data || [];
}

/**
 * Search transaction data
 */
export async function searchTransactionData({ dateFrom, dateTo, process, companyId, category, signal }) {
  const params = new URLSearchParams();
  params.append("date_from", dateFrom);
  params.append("date_to", dateTo);
  if (process) {
    params.append("process", process);
  }
  if (companyId) {
    params.append("company_id", companyId);
  }
  if (category) {
    params.append("category", category);
  }
  
  const url = buildApiUrl(`api/transactions/maintenance_search_api.php?${params.toString()}`);
  let response;
  try {
    response = await fetch(url, { credentials: "include", signal });
  } catch (err) {
    if (err?.name === "AbortError" || signal?.aborted) {
      throw err;
    }
    throw new Error(err?.message || "Search failed");
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(response.ok ? "Search failed" : `Search failed (${response.status})`);
  }

  if (!response.ok || !data.success) {
    throw new Error(data.error || data.message || "Search failed");
  }
  return data.data || [];
}

/**
 * Update session company
 */
export async function updateSessionCompany(companyId) {
  const response = await fetch(buildApiUrl(`api/session/update_company_session_api.php?company_id=${companyId}`), {
    credentials: "include",
  });
  const result = await response.json();
  if (!result.success) {
    throw new Error(result.error || 'Failed to update session company');
  }
  return result.data;
}

/**
 * Format currency with 2 decimal places and thousands separator
 */
export function formatAmount(value) {
    if (value === null || value === undefined || value === '') return '-';
    const val = parseFloat(value);
    if (isNaN(val)) return '-';
    return val.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
}
