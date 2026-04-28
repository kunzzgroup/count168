import { buildApiUrl } from "../../utils/apiUrl.js";

/**
 * Format a Date object to 'DD/MM/YYYY'
 */
export function formatDmy(d) {
  if (!d) return "";
  const day = String(d.getDate()).padStart(2, "0");
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const y = d.getFullYear();
  return `${day}/${m}/${y}`;
}

/**
 * Format a Date object to 'YYYY-MM-DD'
 */
export function formatYmd(d) {
  if (!d) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Parse 'YYYY-MM-DD' to Date object
 */
export function parseYmd(s) {
  if (!s) return null;
  const [y, m, d] = String(s).split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

/**
 * Format 'DD/MM/YYYY' to 'YYYY-MM-DD'
 */
export function parseDdMmYyyyToYmd(str) {
  if (!str || typeof str !== "string") return "";
  const parts = str.trim().split(/[/\-.]/);
  if (parts.length !== 3) return "";
  const day = parts[0].padStart(2, "0");
  const month = parts[1].padStart(2, "0");
  const year = parts[2];
  if (day.length > 2 || month.length > 2 || year.length !== 4) return "";
  return `${year}-${month}-${day}`;
}

/**
 * Format currency with 2 decimal places and thousands separator
 */
export function formatAmount(value) {
  const val = parseFloat(value || 0);
  return val.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Quick range helper
 */
export function quickRangeToDates(range) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let startDate;
  let endDate;
  switch (range) {
    case "today":
      startDate = new Date(today);
      endDate = new Date(today);
      break;
    case "yesterday": {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      startDate = y;
      endDate = y;
      break;
    }
    case "thisWeek": {
      const w = new Date(today);
      const dayOfWeek = w.getDay();
      const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      w.setDate(w.getDate() - daysToMonday);
      startDate = w;
      endDate = new Date(today);
      break;
    }
    case "lastWeek": {
      const lastWeekEnd = new Date(today);
      const lastWeekDayOfWeek = lastWeekEnd.getDay();
      const daysToLastSunday = lastWeekDayOfWeek === 0 ? 0 : lastWeekDayOfWeek;
      lastWeekEnd.setDate(lastWeekEnd.getDate() - daysToLastSunday - 1);
      const lastWeekStart = new Date(lastWeekEnd);
      lastWeekStart.setDate(lastWeekStart.getDate() - 6);
      startDate = lastWeekStart;
      endDate = lastWeekEnd;
      break;
    }
    case "thisMonth":
      startDate = new Date(today.getFullYear(), today.getMonth(), 1);
      endDate = new Date(today);
      break;
    case "lastMonth": {
      const lm = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lmEnd = new Date(today.getFullYear(), today.getMonth(), 0);
      startDate = lm;
      endDate = lmEnd;
      break;
    }
    case "thisYear":
      startDate = new Date(today.getFullYear(), 0, 1);
      endDate = new Date(today);
      break;
    case "lastYear":
      startDate = new Date(today.getFullYear() - 1, 0, 1);
      endDate = new Date(today.getFullYear() - 1, 11, 31);
      break;
    default:
      return null;
  }
  return { startDate: formatYmd(startDate), endDate: formatYmd(endDate) };
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
