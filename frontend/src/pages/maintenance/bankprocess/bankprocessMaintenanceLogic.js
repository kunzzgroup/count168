import { buildApiUrl } from "../../../utils/apiUrl.js";

export function formatDmy(d) {
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

export function formatAmount(value) {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return "0.00";
  return num.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function toUpperDisplay(value) {
  if (value === null || value === undefined) return "-";
  const str = String(value).trim();
  return str ? str.toUpperCase() : "-";
}

export async function fetchCompanyPermissions(companyCode) {
  if (!companyCode) return [];
  try {
    const response = await fetch(buildApiUrl("api/domain/domain_api.php"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "get_company_permissions",
        company_id: companyCode,
      }),
    });
    const result = await response.json();
    return Array.isArray(result?.data?.permissions)
      ? result.data.permissions.filter((p) => p !== "Games")
      : ["Bank", "Loan", "Rate", "Money"];
  } catch {
    return ["Bank", "Loan", "Rate", "Money"];
  }
}

export async function fetchCompanyCurrencies(companyId) {
  let url = buildApiUrl("api/transactions/get_company_currencies_api.php");
  if (companyId) {
    url += `?company_id=${encodeURIComponent(companyId)}`;
  }
  const response = await fetch(url);
  const data = await response.json();
  return data.success ? (data.data || []) : [];
}

export async function searchBankprocessData({ dateFrom, dateTo, companyId, selectedCurrency, query }) {
  const params = new URLSearchParams({
    date_from: dateFrom,
    date_to: dateTo,
  });
  if (companyId) params.set("company_id", String(companyId));
  if (selectedCurrency) params.set("currency", selectedCurrency);
  if (query?.trim()) params.set("q", query.trim());

  const response = await fetch(buildApiUrl(`api/bankprocess_maintenance/search_api.php?${params.toString()}`));
  const result = await response.json();
  if (!result.success) {
    throw new Error(result.message || "Search failed");
  }
  return Array.isArray(result.data) ? result.data : [];
}

export async function deleteBankprocessData(transactionIds) {
  const response = await fetch(buildApiUrl("api/bankprocess_maintenance/delete_api.php"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transaction_ids: transactionIds }),
  });
  const result = await response.json();
  if (!result.success) {
    throw new Error(result.message || "Delete failed");
  }
  return result;
}

export async function updateSessionCompany(companyId) {
  const res = await fetch(buildApiUrl(`api/session/update_company_session_api.php?company_id=${companyId}`));
  const result = await res.json();
  if (!result.success) {
    throw new Error(result.error || "Switch company failed");
  }
  return result.data;
}
