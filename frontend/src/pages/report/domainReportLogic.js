import { buildApiUrl } from "../../utils/apiUrl.js";
import { formatReportAmount } from "./reportAmountFormat.js";

export const formatAmount = formatReportAmount;

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
export async function fetchDomainReport({ dateFrom, dateTo, processId, companyId, selectedCurrencies = [], showAllCurrencies = true }) {
  const params = new URLSearchParams();
  params.append("date_from", dateFrom);
  params.append("date_to", dateTo);
  if (processId) params.append("process_id", processId);
  if (companyId) params.append("company_id", companyId);
  if (!showAllCurrencies && Array.isArray(selectedCurrencies) && selectedCurrencies.length > 0) {
    params.append("currency", selectedCurrencies.join(","));
  }

  const res = await fetch(buildApiUrl(`api/reports/domain_report_api.php?${params.toString()}`), {
    credentials: "include"
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.message || json.error || "Failed to load report");
  }
  return json;
}

/**
 * API function to load processes
 */
export async function fetchProcesses(companyId) {
  const params = new URLSearchParams();
  params.append("action", "processes");
  if (companyId) params.append("company_id", companyId);
  const url = buildApiUrl(`api/reports/domain_report_api.php?${params.toString()}`);
  const res = await fetch(url, { credentials: "include" });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.message || json.error || "Failed to load processes");
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
