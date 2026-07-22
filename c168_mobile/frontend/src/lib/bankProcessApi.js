import { buildApiUrl } from "../utils/apiUrl.js";
import { fetchJson, assertApiOk } from "./fetchJson.js";

export function normalizeBankIssueFlag(v) {
  const s = String(v || "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
  if (!s) return "";
  if (s.includes("e_invoice") || s.includes("einvoice") || s.includes("e invoice")) return "e_invoice";
  if (s.includes("official")) return "official";
  if (s.includes("block")) return "block";
  return "";
}

export function normalizeBankProcessStatus(v) {
  const s = String(v || "").trim().toLowerCase();
  if (!s) return "active";
  if (s.includes("inactive")) return "inactive";
  if (s.includes("waiting")) return "waiting";
  if (s.includes("active")) return "active";
  return "active";
}

export function normalizeBankProcessRows(data) {
  if (!Array.isArray(data)) return [];
  return data.map((row) => ({
    ...row,
    type: String(row?.type || row?.types || "").trim(),
    status: normalizeBankProcessStatus(row?.status),
    issue_flag: normalizeBankIssueFlag(row?.issue_flag),
  }));
}

/** UI status pill — issue_flag wins over active/inactive. */
export function bankProcessDisplayStatus(row) {
  const flag = normalizeBankIssueFlag(row?.issue_flag);
  if (flag === "official") return "OFFICIAL";
  if (flag === "e_invoice") return "E-INVOICE";
  if (flag === "block") return "BLOCK";
  return normalizeBankProcessStatus(row?.status) === "inactive" ? "INACTIVE" : "ACTIVE";
}

export function matchesBankProcessStatusFilters(row, filters) {
  if (!row) return false;
  const { showActive, showInactive, showOfficial, showEInvoice, showBlock } = filters || {};
  const status = normalizeBankProcessStatus(row.status);
  const issueFlag = normalizeBankIssueFlag(row.issue_flag);
  const isPlainInactive =
    status === "inactive" &&
    issueFlag !== "official" &&
    issueFlag !== "e_invoice" &&
    issueFlag !== "block";
  const isDefaultActive =
    status === "active" &&
    issueFlag !== "official" &&
    issueFlag !== "e_invoice" &&
    issueFlag !== "block";
  const matches = [];
  if (showActive) matches.push(isDefaultActive);
  if (showInactive) matches.push(isPlainInactive);
  if (showOfficial) matches.push(issueFlag === "official");
  if (showEInvoice) matches.push(issueFlag === "e_invoice");
  if (showBlock) matches.push(issueFlag === "block");
  if (matches.length === 0) return isDefaultActive;
  return matches.some(Boolean);
}

export function filterBankProcessRowsBySearch(rows, searchTerm) {
  const q = String(searchTerm || "").trim().toUpperCase();
  if (!q || !Array.isArray(rows)) return rows || [];
  return rows.filter((r) => {
    const hay = [
      r?.country,
      r?.bank,
      r?.type,
      r?.types,
      r?.supplier,
      r?.card_lower,
      r?.customer,
      r?.name,
      r?.card_merchant_name,
      r?.card_merchant_account_id,
    ]
      .map((x) => String(x || "").toUpperCase())
      .join(" ");
    return hay.includes(q);
  });
}

function parseRowDateMs(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const [y, m, d] = s.slice(0, 10).split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setHours(0, 0, 0, 0);
    return Number.isNaN(dt.getTime()) ? null : dt.getTime();
  }
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{4}/.test(s)) {
    const p = s.split(/[/-]/);
    const dd = Number(p[0]);
    const mm = Number(p[1]);
    const yy = Number(p[2]);
    const dt = new Date(yy, mm - 1, dd);
    dt.setHours(0, 0, 0, 0);
    return Number.isNaN(dt.getTime()) ? null : dt.getTime();
  }
  return null;
}

export function filterBankProcessRowsByDate(rows, dateFrom, dateTo) {
  if (!dateFrom && !dateTo) return rows;
  const fromMs = dateFrom ? parseRowDateMs(dateFrom) : null;
  const toMs = dateTo ? parseRowDateMs(dateTo) : null;
  const toEnd = toMs != null ? toMs + 86400000 - 1 : null;
  return rows.filter((r) => {
    const ts = parseRowDateMs(r.date || r.day_start);
    if (ts == null) return false;
    if (fromMs !== null && ts < fromMs) return false;
    if (toEnd !== null && ts > toEnd) return false;
    return true;
  });
}

export function formatBankMoney(value) {
  const raw = String(value ?? "").trim().replace(/,/g, "");
  if (!raw) return "0.00";
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function bankTypeLabel(row) {
  const bank = String(row?.bank || "").trim() || "—";
  const type = String(row?.type || row?.types || "").trim();
  return type ? `${bank} (${type})` : bank;
}

/** Whether company code has Bank category (desktop domain_api). */
export async function companyHasBankPermission(companyCode, signal) {
  const code = String(companyCode || "").trim();
  if (!code) return false;
  try {
    const { res, json } = await fetchJson(buildApiUrl("api/domain/domain_api.php"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "get_company_permissions", company_id: code }),
      signal,
    });
    if (!res.ok || !json?.success) return false;
    const permissions = Array.isArray(json?.data?.permissions) ? json.data.permissions : [];
    return permissions.map((p) => String(p || "").toLowerCase()).includes("bank");
  } catch (e) {
    if (e?.name === "AbortError") throw e;
    return false;
  }
}

/**
 * Fetch bank process list for a numeric company id (desktop processlist_api).
 * @returns {{ rows: object[], currencyCodes: string[] }}
 */
export async function fetchBankProcessList(companyId, { signal } = {}) {
  const cid = Number(companyId);
  if (!Number.isFinite(cid) || cid <= 0) {
    throw new Error("Missing company");
  }

  const listUrl = new URL(buildApiUrl("api/processes/processlist_api.php"));
  listUrl.searchParams.set("permission", "Bank");
  listUrl.searchParams.set("company_id", String(cid));
  listUrl.searchParams.set("showAll", "1");

  const curUrl = buildApiUrl(`api/transactions/get_company_currencies_api.php?company_id=${cid}`);

  const [listRes, curPack] = await Promise.all([
    fetchJson(listUrl.toString(), { signal }),
    fetchJson(curUrl, { signal }).catch((e) => {
      if (e?.name === "AbortError") throw e;
      return { res: { ok: false }, json: null };
    }),
  ]);

  assertApiOk(listRes.res, listRes.json, "Failed to load bank processes");
  const rows = normalizeBankProcessRows(listRes.json.data);

  let currencyCodes = [];
  if (curPack.res?.ok && curPack.json?.success && Array.isArray(curPack.json.data)) {
    currencyCodes = [
      ...new Set(curPack.json.data.map((r) => String(r.code || "").toUpperCase()).filter(Boolean)),
    ];
  } else {
    currencyCodes = [
      ...new Set(rows.map((r) => String(r.country || "").trim().toUpperCase()).filter(Boolean)),
    ];
  }

  return { rows, currencyCodes };
}
