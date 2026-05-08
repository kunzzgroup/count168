import { buildApiUrl } from "../../utils/apiUrl.js";

/**
 * Format currency with 2 decimal places (half-up) and thousands separator.
 * Matches legacy MoneyDecimal.formatFixedHalfUp(val, 2).
 */
export function formatAmount(value) {
  const val = parseFloat(value || 0);
  if (isNaN(val)) return "0.00";

  const rounded = Math.round((val + Number.EPSILON) * 100) / 100;

  return rounded.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Add two values with precision (simple version of reportAdd)
 */
export function reportAdd(a, b) {
  const valA = parseFloat(a || 0);
  const valB = parseFloat(b || 0);
  return (valA + valB).toString();
}

/**
 * Fetch company permissions
 */
export async function fetchCompanyPermissions(companyCode) {
  if (!companyCode) return [];
  try {
    const response = await fetch(buildApiUrl("api/domain/domain_api.php"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "get_company_permissions", company_id: companyCode }),
    });
    const result = await response.json();
    if (result.success && result.data && Array.isArray(result.data.permissions)) {
      return result.data.permissions;
    }
  } catch (err) {
    console.error("Error fetching company permissions:", err);
  }
  return [];
}

/**
 * Check if company is bank-only
 */
export function isBankOnlyCategoryCompany(permissions) {
  if (!Array.isArray(permissions) || permissions.length === 0) return false;
  const hasBank = permissions.includes("Bank");
  const hasGames = permissions.includes("Games") || permissions.includes("Gambling");
  return hasBank && !hasGames;
}

/**
 * API function to load report
 */
export async function fetchCustomerReport({ accountId, dateFrom, dateTo, showAll, companyId, selectedCurrencies, showAllCurrencies }) {
  const params = new URLSearchParams();
  if (accountId) params.append("account_id", accountId);
  params.append("date_from", dateFrom);
  params.append("date_to", dateTo);
  if (showAll) params.append("show_all", "1");
  if (companyId) params.append("company_id", companyId);
  if (!showAllCurrencies && selectedCurrencies.length > 0) {
    params.append("currency", selectedCurrencies.join(","));
  }

  const res = await fetch(buildApiUrl(`api/reports/customer_report_api.php?${params.toString()}`), {
    credentials: "include"
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.message || json.error || "Failed to load report");
  }
  return json;
}

/**
 * API function to load accounts
 */
export async function fetchAccounts(companyId) {
  const params = new URLSearchParams();
  if (companyId) params.append("company_id", companyId);
  const url = buildApiUrl(`api/transactions/get_accounts_api.php?${params.toString()}`);
  const res = await fetch(url, { credentials: "include" });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.message || json.error || "Failed to load accounts");
  }
  return json.data || [];
}

/**
 * API function to load currencies
 */
export async function fetchCurrencies(companyId) {
  let url = buildApiUrl("api/transactions/get_company_currencies_api.php");
  if (companyId) url += `?company_id=${companyId}`;
  const res = await fetch(url, { credentials: "include" });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.message || json.error || "Failed to load currencies");
  }
  return json.data || [];
}
