import { buildApiUrl } from "../../../utils/apiUrl.js";
import { formatDmy, parseDdMmYyyyToYmd, parseYmd } from "../../../utils/dateUtils.js";

/** Wider ranges are split so each response stays small (avoids HTTP/2 protocol errors on Hostinger). */
const MAINTENANCE_CHUNK_DAYS = 31;
const MAINTENANCE_CHUNK_THRESHOLD_DAYS = 45;

function isFetchAbortError(err, signal) {
  if (signal?.aborted) return true;
  if (err?.name === "AbortError") return true;
  return false;
}

/** Browsers sometimes throw TypeError("Failed to fetch") on abort — normalize for React Query. */
function rethrowIfAborted(err, signal) {
  if (!isFetchAbortError(err, signal)) return;
  if (err?.name === "AbortError") throw err;
  throw new DOMException("The operation was aborted.", "AbortError");
}

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
 * Search transaction data (auto-splits wide date ranges into smaller API calls).
 */
export async function searchTransactionData({ dateFrom, dateTo, process, companyId, category, signal }) {
  const daySpan = maintenanceDateSpanDays(dateFrom, dateTo);
  if (daySpan <= MAINTENANCE_CHUNK_THRESHOLD_DAYS) {
    return searchTransactionMaintenanceOnce({ dateFrom, dateTo, process, companyId, category, signal });
  }

  const chunks = splitMaintenanceDateRange(dateFrom, dateTo, MAINTENANCE_CHUNK_DAYS);
  const merged = [];
  for (const chunk of chunks) {
    if (signal?.aborted) {
      throw new DOMException("The operation was aborted.", "AbortError");
    }
    const part = await searchTransactionMaintenanceOnce({
      dateFrom: chunk.dateFrom,
      dateTo: chunk.dateTo,
      process,
      companyId,
      category,
      signal,
    });
    if (part.length) merged.push(...part);
  }

  merged.sort(compareMaintenanceRows);
  merged.forEach((row, index) => {
    row.no = index + 1;
  });
  return merged;
}

function maintenanceDateSpanDays(dateFrom, dateTo) {
  const start = parseMaintenanceDmyDate(dateFrom);
  const end = parseMaintenanceDmyDate(dateTo);
  if (!start || !end || start > end) return 0;
  return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
}

function parseMaintenanceDmyDate(dmy) {
  const ymd = parseDdMmYyyyToYmd(dmy);
  return ymd ? parseYmd(ymd) : null;
}

function splitMaintenanceDateRange(dateFrom, dateTo, maxDays) {
  const start = parseMaintenanceDmyDate(dateFrom);
  const end = parseMaintenanceDmyDate(dateTo);
  if (!start || !end || start > end) return [{ dateFrom, dateTo }];

  const chunks = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    const chunkEnd = new Date(cursor);
    chunkEnd.setDate(chunkEnd.getDate() + maxDays - 1);
    if (chunkEnd > end) chunkEnd.setTime(end.getTime());
    chunks.push({ dateFrom: formatDmy(cursor), dateTo: formatDmy(chunkEnd) });
    cursor.setTime(chunkEnd.getTime());
    cursor.setDate(cursor.getDate() + 1);
  }
  return chunks;
}

function parseMaintenanceDtsTimestamp(value) {
  const raw = String(value ?? "").trim();
  const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return 0;
  return new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +m[6]).getTime();
}

function compareMaintenanceRows(a, b) {
  const dateA = a.transaction_date ?? "";
  const dateB = b.transaction_date ?? "";
  if (dateA !== dateB) return dateB.localeCompare(dateA);

  const tsA = parseMaintenanceDtsTimestamp(a.dts_created);
  const tsB = parseMaintenanceDtsTimestamp(b.dts_created);
  if (tsA !== tsB) return tsB - tsA;

  const capA = Number(a.capture_id ?? 0);
  const capB = Number(b.capture_id ?? 0);
  if (capA !== capB) return capB - capA;

  const detA = Number(a.capture_detail_id ?? 0);
  const detB = Number(b.capture_detail_id ?? 0);
  if (detA !== detB) return detB - detA;

  return Number(b.transaction_id ?? 0) - Number(a.transaction_id ?? 0);
}

async function searchTransactionMaintenanceOnce({ dateFrom, dateTo, process, companyId, category, signal }) {
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
    response = await fetch(url, {
      credentials: "include",
      signal,
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
  } catch (err) {
    rethrowIfAborted(err, signal);
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
