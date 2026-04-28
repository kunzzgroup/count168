import { buildApiUrl } from "../../../utils/apiUrl.js";
import { formatYmd } from "../../../utils/dateUtils.js";

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
 * API function to load report
 */
export async function fetchDomainReport({ dateFrom, dateTo, processId, companyId }) {
  const params = new URLSearchParams();
  params.append("date_from", dateFrom);
  params.append("date_to", dateTo);
  if (processId) params.append("process_id", processId);
  if (companyId) params.append("company_id", companyId);

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
