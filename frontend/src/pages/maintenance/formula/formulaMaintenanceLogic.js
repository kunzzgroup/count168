import { buildApiUrl } from "../../../utils/apiUrl.js";

/**
 * Fetch permissions for a specific company (filtering out Bank)
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
    let permissions = ['Games', 'Loan', 'Rate', 'Money'];
    if (result.success && result.data && Array.isArray(result.data.permissions)) {
      permissions = result.data.permissions;
    }
    // Formula maintenance excludes Bank category
    return permissions.filter(p => p !== 'Bank');
  } catch (err) {
    console.error("Error fetching company permissions:", err);
    return ['Games', 'Loan', 'Rate', 'Money'];
  }
}

/**
 * Fetch process list for a specific company
 */
export async function fetchProcesses(companyId) {
  const params = new URLSearchParams();
  if (companyId) params.append("company_id", companyId);
  const url = buildApiUrl(`api/processes/processlist_api.php?${params.toString()}`);
  
  const response = await fetch(url);
  const data = await response.json();
  if (!data.success) throw new Error(data.error || 'Failed to load process list');
  return data.data || [];
}

/**
 * Fetch accounts for a specific company
 */
export async function fetchAccounts(companyId) {
  const params = new URLSearchParams();
  if (companyId) params.append("company_id", companyId);
  params.append("status", "active");
  const url = buildApiUrl(`api/transactions/get_accounts_api.php?${params.toString()}`);
  
  const response = await fetch(url);
  const data = await response.json();
  if (!data.success) throw new Error(data.error || 'Failed to load accounts');
  return data.data || [];
}

/**
 * List formula templates
 */
export async function listFormulaTemplates({ companyId, category, process, search }) {
  const params = new URLSearchParams();
  if (companyId) params.append("company_id", companyId);
  if (category) params.append("category", category);
  if (process) params.append("process", process);
  if (search) params.append("search", search);
  params.append("_t", Date.now()); // Prevent caching
  
  const url = buildApiUrl(`api/formula_maintenance/list_api.php?${params.toString()}`);
  const response = await fetch(url, { cache: 'no-cache' });
  const data = await response.json();
  
  if (!data.success) throw new Error(data.message || data.error || 'Search failed');
  return (data.data && data.data.list) ? data.data.list : (data.data || []);
}

/**
 * Update formula template
 */
export async function updateFormulaTemplate(payload) {
  const response = await fetch(buildApiUrl('api/formula_maintenance/update_api.php'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!data.success) throw new Error(data.message || data.error || 'Update failed');
  return data.data;
}

/**
 * Delete formula templates
 */
export async function deleteFormulaTemplates(companyId, templateIds) {
  const response = await fetch(buildApiUrl('api/formula_maintenance/delete_api.php'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ company_id: companyId, template_ids: templateIds })
  });
  const data = await response.json();
  if (!data.success) throw new Error(data.message || data.error || 'Delete failed');
  return data;
}

/**
 * Update session company
 */
export async function updateSessionCompany(companyId) {
  const response = await fetch(buildApiUrl(`api/session/update_company_session_api.php?company_id=${companyId}`));
  const result = await response.json();
  if (!result.success) throw new Error(result.error || 'Failed to update session company');
  return result.data;
}

export const INPUT_METHOD_OPTIONS = [
  { value: '', text: 'Select Input Method (Optional)' },
  { value: 'positive_to_negative_negative_to_positive', text: 'Positive to negative, negative to positive' },
  { value: 'positive_to_negative_negative_to_zero', text: 'Positive to negative, negative to zero' },
  { value: 'negative_to_positive_positive_to_zero', text: 'Negative to positive, positive to zero' },
  { value: 'positive_unchanged_negative_to_zero', text: 'Positive unchanged, negative to zero' },
  { value: 'negative_unchanged_positive_to_zero', text: 'Negative unchanged, positive to zero' },
  { value: 'change_to_positive', text: 'Change to positive' },
  { value: 'change_to_negative', text: 'Change to negative' },
  { value: 'change_to_zero', text: 'Change to zero' }
];

export const toUpperDisplay = (val) => {
  if (val === null || val === undefined) return '-';
  const str = String(val).trim();
  return str ? str.toUpperCase() : '-';
};
