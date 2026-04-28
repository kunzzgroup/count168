import { buildApiUrl } from "../../../utils/apiUrl.js";

/**
 * Fetch permissions for a specific company
 */
export async function fetchCompanyPermissions(companyCode) {
  if (!companyCode) return [];
  if (String(companyCode).trim().toUpperCase() === 'C168') return [];
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
    return ['Games', 'Bank', 'Loan', 'Rate', 'Money'];
  } catch (err) {
    console.error("Error fetching company permissions:", err);
    return ['Games', 'Bank', 'Loan', 'Rate', 'Money'];
  }
}

/**
 * Fetch currencies for a specific company
 */
export async function fetchCompanyCurrencies(companyId) {
  const url = buildApiUrl(`api/transactions/get_company_currencies_api.php${companyId ? `?company_id=${companyId}` : ''}`);
  const response = await fetch(url);
  const data = await response.json();
  if (data.success) {
    return data.data || [];
  }
  return [];
}

/**
 * Search payment data
 */
export async function searchPaymentData({ dateFrom, dateTo, transactionType, companyId, currency }) {
  const params = new URLSearchParams();
  params.append("date_from", dateFrom);
  params.append("date_to", dateTo);
  if (transactionType) params.append("transaction_type", transactionType);
  if (companyId) params.append("company_id", companyId);
  if (currency) params.append("currency", currency);
  
  const url = buildApiUrl(`api/payment_maintenance/search_api.php?${params.toString()}`);
  const response = await fetch(url);
  const data = await response.json();
  
  if (!data.success) {
    throw new Error(data.message || 'Search failed');
  }
  
  return mergeProfitRows(data.data || []);
}

/**
 * Delete payment records
 */
export async function deletePaymentRecords(transactionIds) {
  const response = await fetch(buildApiUrl('api/payment_maintenance/delete_api.php'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transaction_ids: transactionIds })
  });
  const data = await response.json();
  if (!data.success) {
    throw new Error(data.message || 'Delete failed');
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
 * Bank Process description stripping
 */
export function stripBankProcessDescriptionPrefix(text) {
  const s = String(text || '');
  const m = s.match(/^\s*process:\s*(.*)$/i);
  return m ? m[1].trim() : s;
}

/**
 * Merge profit rows for display
 */
function mergeProfitRows(data) {
  if (!Array.isArray(data) || data.length === 0) return data || [];
  const type = (row) => (row.transaction_type || '').toUpperCase();
  const acc = (row) => (row.account || '').toString().toUpperCase();
  const isProfitRow = (row) => (type(row) === 'WIN' || type(row) === 'LOSE') && acc(row).startsWith('PROFIT');
  const isWinLoseRow = (row) => type(row) === 'WIN' || type(row) === 'LOSE';
  const key = (row) => [row.dts_created, String(row.amount || ''), (row.currency || '').toUpperCase()].join('\t');
  
  const profitByKey = {};
  data.forEach(row => {
    if (!isProfitRow(row)) return;
    const k = key(row);
    if (!profitByKey[k]) profitByKey[k] = [];
    profitByKey[k].push(row.account || 'PROFIT');
  });

  return data.filter(row => {
    if (isProfitRow(row)) return false;
    if (isWinLoseRow(row)) {
      const k = key(row);
      const fromCandidates = profitByKey[k];
      if (fromCandidates && fromCandidates.length > 0) {
        row.from_account = fromCandidates[0];
        const desc = (row.description || '').trim();
        if (!desc || desc === '-' || desc === 'PROFIT' || desc.toUpperCase() === 'WIN' || desc.toUpperCase() === 'LOSE') {
          const toAccountLabel = row.account || '';
          row.description = toAccountLabel ? `PROFIT FROM ${toAccountLabel}` : 'PROFIT';
        }
        fromCandidates.shift();
      }
    }
    return true;
  });
}

/**
 * Format amount
 */
export function formatAmount(num) {
  try {
    if (num === null || num === undefined || num === '') return '0.00';
    return parseFloat(num).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  } catch (_) {
    return '0.00';
  }
}
