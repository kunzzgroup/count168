import { buildApiUrl } from "../../../utils/apiUrl.js";
import { formatDmy, parseDdMmYyyyToYmd, parseYmd } from "../../../utils/dateUtils.js";

/** 宽日期兜底分片（后端已 SQL 分页，默认整段查询；仅超大范围才分片）。 */
const MAINTENANCE_CHUNK_DAYS = 60;
const MAINTENANCE_CHUNK_THRESHOLD_DAYS = 400;
const MAINTENANCE_PARALLEL_CHUNKS = 4;
/** Page sizes tried in order when a response is still too large. */
const MAINTENANCE_PAGE_SIZES = [5000, 2500, 1500, 1000, 500];
const MAINTENANCE_PARALLEL_PAGES = 4;
const MAINTENANCE_FETCH_RETRIES = 4;
const MAINTENANCE_RETRY_BASE_MS = 250;

function isFetchAbortError(err, signal) {
  if (signal?.aborted) return true;
  if (err?.name === "AbortError") return true;
  return false;
}

function rethrowIfAborted(err, signal) {
  if (!isFetchAbortError(err, signal)) return;
  if (err?.name === "AbortError") throw err;
  throw new DOMException("The operation was aborted.", "AbortError");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isMaintenanceTransferError(err) {
  const msg = String(err?.message || "").toLowerCase();
  return (
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("network error") ||
    msg.includes("load failed") ||
    msg.includes("http2") ||
    msg.includes("search failed (502)") ||
    msg.includes("search failed (503)") ||
    msg.includes("search failed (504)") ||
    msg.includes("search failed (413)") ||
    msg.includes("search failed (524)") ||
    msg.includes("search failed (520)")
  );
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

export function isBankOnlyCategoryCompany(permissions) {
  if (!Array.isArray(permissions) || permissions.length === 0) return false;
  const hasBank = permissions.includes('Bank');
  const hasGames = permissions.includes('Games') || permissions.includes('Gambling');
  return hasBank && !hasGames;
}

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
 * Search transaction maintenance data.
 * Automatically: splits wide date ranges → paginates each slice → retries → splits again on failure.
 */
export async function searchTransactionData({ dateFrom, dateTo, process, companyId, category, signal }) {
  const merged = await fetchMaintenanceDateRangeResilient({
    dateFrom,
    dateTo,
    process,
    companyId,
    category,
    signal,
  });
  merged.sort(compareMaintenanceRows);
  merged.forEach((row, index) => {
    row.no = index + 1;
  });
  return merged;
}

async function fetchMaintenanceDateRangeResilient({ dateFrom, dateTo, process, companyId, category, signal }) {
  const daySpan = maintenanceDateSpanDays(dateFrom, dateTo);
  const ranges =
    daySpan > MAINTENANCE_CHUNK_THRESHOLD_DAYS
      ? splitMaintenanceDateRange(dateFrom, dateTo, MAINTENANCE_CHUNK_DAYS)
      : [{ dateFrom, dateTo }];

  if (ranges.length === 1) {
    return fetchMaintenanceRangeWithSplit({
      dateFrom: ranges[0].dateFrom,
      dateTo: ranges[0].dateTo,
      process,
      companyId,
      category,
      signal,
    });
  }

  const merged = [];
  for (let i = 0; i < ranges.length; i += MAINTENANCE_PARALLEL_CHUNKS) {
    if (signal?.aborted) {
      throw new DOMException("The operation was aborted.", "AbortError");
    }
    const batch = ranges.slice(i, i + MAINTENANCE_PARALLEL_CHUNKS);
    const parts = await Promise.all(
      batch.map((range) =>
        fetchMaintenanceRangeWithSplit({
          dateFrom: range.dateFrom,
          dateTo: range.dateTo,
          process,
          companyId,
          category,
          signal,
        }),
      ),
    );
    for (const part of parts) {
      if (part.length) merged.push(...part);
    }
  }
  return merged;
}

async function fetchMaintenanceRangeWithSplit(params) {
  try {
    return await fetchAllPagesForRange(params, 0);
  } catch (err) {
    rethrowIfAborted(err, params.signal);
    if (!isMaintenanceTransferError(err)) throw err;

    const daySpan = maintenanceDateSpanDays(params.dateFrom, params.dateTo);
    if (daySpan <= 1) {
      return fetchAllPagesForRange(params, MAINTENANCE_PAGE_SIZES.length - 1);
    }

    const [leftRange, rightRange] = splitMaintenanceDateRangeHalf(params.dateFrom, params.dateTo);
    const left = await fetchMaintenanceRangeWithSplit({
      ...params,
      dateFrom: leftRange.dateFrom,
      dateTo: leftRange.dateTo,
    });
    const right = await fetchMaintenanceRangeWithSplit({
      ...params,
      dateFrom: rightRange.dateFrom,
      dateTo: rightRange.dateTo,
    });
    return left.concat(right);
  }
}

async function fetchAllPagesForRange(params, pageSizeIndex) {
  const pageSize = MAINTENANCE_PAGE_SIZES[Math.min(pageSizeIndex, MAINTENANCE_PAGE_SIZES.length - 1)];

  const fetchPage = async (page) => {
    try {
      return await fetchMaintenancePageWithRetries({ ...params, page, pageSize });
    } catch (err) {
      rethrowIfAborted(err, params.signal);
      if (isMaintenanceTransferError(err) && pageSizeIndex < MAINTENANCE_PAGE_SIZES.length - 1) {
        return fetchAllPagesForRange(params, pageSizeIndex + 1);
      }
      throw err;
    }
  };

  if (params.signal?.aborted) {
    throw new DOMException("The operation was aborted.", "AbortError");
  }

  const first = await fetchPage(1);
  const all = [...(first.data || [])];
  const total = Number(first.pagination?.total ?? all.length);
  const totalPages = total > 0 ? Math.ceil(total / pageSize) : 1;

  if (totalPages <= 1 || !first.pagination?.has_more) {
    return all;
  }

  const remainingPages = [];
  for (let p = 2; p <= totalPages; p += 1) {
    remainingPages.push(p);
  }

  for (let i = 0; i < remainingPages.length; i += MAINTENANCE_PARALLEL_PAGES) {
    if (params.signal?.aborted) {
      throw new DOMException("The operation was aborted.", "AbortError");
    }
    const batch = remainingPages.slice(i, i + MAINTENANCE_PARALLEL_PAGES);
    const results = await Promise.all(batch.map((page) => fetchPage(page)));
    for (const result of results) {
      if (result.data?.length) all.push(...result.data);
    }
  }

  return all;
}

async function fetchMaintenancePageWithRetries(params) {
  let lastErr;
  for (let attempt = 0; attempt < MAINTENANCE_FETCH_RETRIES; attempt += 1) {
    try {
      return await searchTransactionMaintenanceOnce(params);
    } catch (err) {
      lastErr = err;
      rethrowIfAborted(err, params.signal);
      if (!isMaintenanceTransferError(err)) throw err;
      if (attempt < MAINTENANCE_FETCH_RETRIES - 1) {
        await sleep(MAINTENANCE_RETRY_BASE_MS * (attempt + 1));
      }
    }
  }
  throw lastErr;
}

function splitMaintenanceDateRangeHalf(dateFrom, dateTo) {
  const start = parseMaintenanceDmyDate(dateFrom);
  const totalDays = maintenanceDateSpanDays(dateFrom, dateTo);
  const mid = new Date(start);
  mid.setDate(mid.getDate() + Math.floor(totalDays / 2) - 1);
  const rightStart = new Date(mid);
  rightStart.setDate(rightStart.getDate() + 1);
  return [
    { dateFrom, dateTo: formatDmy(mid) },
    { dateFrom: formatDmy(rightStart), dateTo },
  ];
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

async function searchTransactionMaintenanceOnce({
  dateFrom,
  dateTo,
  process,
  companyId,
  category,
  signal,
  page = 1,
  pageSize = MAINTENANCE_PAGE_SIZES[0],
}) {
  const params = new URLSearchParams();
  params.append("date_from", dateFrom);
  params.append("date_to", dateTo);
  params.append("page", String(page));
  params.append("page_size", String(pageSize));
  if (process) params.append("process", process);
  if (companyId) params.append("company_id", companyId);
  if (category) params.append("category", category);

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

  const rows = Array.isArray(data.data) ? data.data : [];
  const pagination = data.pagination ?? {
    page,
    page_size: pageSize,
    total: rows.length,
    has_more: false,
  };

  return { data: rows, pagination };
}

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

export function formatAmount(value) {
  if (value === null || value === undefined || value === '') return '-';
  const val = parseFloat(value);
  if (isNaN(val)) return '-';
  return val.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
