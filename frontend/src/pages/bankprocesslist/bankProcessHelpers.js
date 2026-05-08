export const PAGE_SIZE = 20;

/** 与旧版 bank_process_list.js BANK_GRID_TEMPLATE_COLUMNS 一致，保证列宽对齐 */
export const BANK_GRID_TEMPLATE_COLUMNS =
  "0.2fr 0.64fr 0.48fr 0.62fr 0.44fr 0.78fr 0.56fr 0.5fr 0.56fr 0.3fr 0.3fr 0.3fr 0.5fr 0.44fr 0.34fr";

export function normalizeRows(data) {
  if (!Array.isArray(data)) return [];
  return data.map((row) => {
    const normalizedType = String(row?.type || row?.types || "").trim();
    const normalizedStatus = normalizeBankProcessStatus(row?.status);
    const normalizedIssueFlag = normalizeBankIssueFlag(row?.issue_flag);
    return {
      ...row,
      type: normalizedType,
      status: normalizedStatus,
      issue_flag: normalizedIssueFlag,
    };
  });
}

export function normalizeBankIssueFlag(v) {
  const s = String(v || "").trim().toLowerCase().replace(/-/g, "_");
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

export function isBankInactiveLike(status, issueFlag) {
  const s = normalizeBankProcessStatus(status);
  const f = normalizeBankIssueFlag(issueFlag);
  return s === "inactive" || f === "official" || f === "e_invoice" || f === "block";
}

/**
 * Bank list client-side row filter (legacy bank_process_list.js matchesCurrentBankFilters).
 * - showAll: keep everything (date-range still applied by caller)
 * - any of showInactive/showOfficial/showEInvoice/showBlock: union of those exact buckets
 * - none: only "default visible" rows = active AND issue_flag NOT IN (official, e_invoice, block)
 *
 * "Plain inactive" means status==='inactive' AND issue_flag NOT IN (official, e_invoice, block).
 */
export function matchesCurrentBankFilters(row, filters) {
  if (!row) return false;
  const { showAll, showInactive, showOfficial, showEInvoice, showBlock } = filters || {};
  if (showAll) return true;
  const status = normalizeBankProcessStatus(row.status);
  const issueFlag = normalizeBankIssueFlag(row.issue_flag);
  const isPlainInactive =
    status === "inactive" && issueFlag !== "official" && issueFlag !== "e_invoice" && issueFlag !== "block";
  const matches = [];
  if (showInactive) matches.push(isPlainInactive);
  if (showOfficial) matches.push(issueFlag === "official");
  if (showEInvoice) matches.push(issueFlag === "e_invoice");
  if (showBlock) matches.push(issueFlag === "block");
  if (matches.length === 0) {
    return (
      status === "active" && issueFlag !== "official" && issueFlag !== "e_invoice" && issueFlag !== "block"
    );
  }
  return matches.some(Boolean);
}

export function canShowBankResend(row) {
  const s = normalizeBankProcessStatus(row?.status);
  return s === "active" && !isBankInactiveLike(row?.status, row?.issue_flag);
}

export function isoToDmy(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(String(iso).trim())) return "";
  const [y, m, d] = String(iso).trim().split("-");
  return `${d}/${m}/${y}`;
}

export function dmyToIso(dmy) {
  const t = String(dmy || "").trim();
  if (!/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(t)) return "";
  const p = t.split("/");
  const dd = parseInt(p[0], 10);
  const mm = parseInt(p[1], 10);
  const yy = parseInt(p[2], 10);
  if (!yy || !mm || !dd) return "";
  return `${String(yy)}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

export function parseRowDateMs(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const head = s.slice(0, 10);
    const t = new Date(`${head}T00:00:00`).getTime();
    return Number.isNaN(t) ? null : t;
  }
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
    const [dd, mm, yy] = s.split("/").map((x) => Number(x, 10));
    const t = new Date(yy, mm - 1, dd).getTime();
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

export function isBankResendDayStartBackendErrorMessage(text) {
  const s = String(text || "");
  return (
    s.includes("不可与今天相同") ||
    s.includes("Day start cannot be today") ||
    s.includes("Resend 所填 Day start") ||
    s.includes("same calendar date as the current contract Day start")
  );
}

export function notifyTransactionDataChanged(sourceTag) {
  const ts = String(Date.now());
  try {
    localStorage.setItem("count168_tx_invalidate_ts", ts);
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new CustomEvent("tx-data-changed", { detail: { ts, source: sourceTag || "bank-process-list-react" } }));
  } catch {
    /* ignore */
  }
}

export async function isBankCategoryCompany(companyCode, buildApiUrl) {
  if (!companyCode) return false;
  try {
    const res = await fetch(buildApiUrl("api/domain/domain_api.php"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action: "get_company_permissions", company_id: companyCode }),
    });
    const json = await res.json();
    const permissions = Array.isArray(json?.data?.permissions) ? json.data.permissions : [];
    const normalized = permissions.map((p) => String(p || "").toLowerCase());
    return normalized.includes("bank") && !normalized.includes("games") && !normalized.includes("gambling");
  } catch {
    return false;
  }
}

export function profitSharingTotalFromString(s) {
  let total = 0;
  const str = String(s || "").trim();
  if (!str) return 0;
  for (const part of str.split(",")) {
    const t = part.trim();
    const dash = t.lastIndexOf(" - ");
    if (dash === -1) continue;
    const n = parseFloat(t.slice(dash + 3).trim());
    if (!Number.isNaN(n)) total += n;
  }
  return total;
}

export function parseProfitSharingToRows(s, accounts) {
  const out = [];
  const str = String(s || "").trim();
  if (!str) return out;
  for (const part of str.split(",")) {
    const t = part.trim();
    const dash = t.lastIndexOf(" - ");
    if (dash === -1) continue;
    const label = t.slice(0, dash).trim();
    const amount = parseFloat(t.slice(dash + 3).trim());
    if (!label || Number.isNaN(amount)) continue;
    const acc = (accounts || []).find(
      (a) => String(a.account_id || "").toLowerCase() === label.toLowerCase() || String(a.name || "").toLowerCase() === label.toLowerCase()
    );
    out.push({ accountId: acc ? String(acc.id) : "", accountLabel: label, amount: String(amount) });
  }
  return out;
}

export function serializeProfitSharingRows(rows, accounts) {
  return rows
    .map((r) => {
      const acc = (accounts || []).find((a) => String(a.id) === String(r.accountId));
      const label = (acc?.account_id || String(r.accountLabel || "").trim()).trim();
      const amt = parseFloat(String(r.amount));
      if (!label || Number.isNaN(amt) || amt <= 0) return null;
      return `${label} - ${amt}`;
    })
    .filter(Boolean)
    .join(", ");
}

export function deriveBankProcessUiStatus(row) {
  const f = normalizeBankIssueFlag(row?.issue_flag);
  if (f === "official") return "OFFICIAL";
  if (f === "e_invoice") return "E_INVOICE";
  if (f === "block") return "BLOCK";
  const s = normalizeBankProcessStatus(row?.status);
  if (s === "inactive") return "INACTIVE";
  if (s === "waiting") return "ACTIVE";
  return "ACTIVE";
}

export const EMPTY_BANK_FORM = {
  id: "",
  country: "",
  bank: "",
  type: "",
  name: "",
  card_merchant_id: "",
  customer_id: "",
  profit_account_id: "",
  contract: "",
  insurance: "",
  cost: "",
  price: "",
  profit: "",
  profit_sharing: "",
  day_start: "",
  day_end: "",
  day_start_frequency: "1st_of_every_month",
  status: "active",
  remark: "",
  sop: "",
};

export const parseBankContractTermMonths = (contract) => {
  if (!contract || String(contract).trim() === '') return null;
  const c = String(contract).trim();
  let m = c.match(/^1\+(\d+)$/i);
  if (m) return 1 + parseInt(m[1], 10);
  m = c.match(/^(\d+)\s*MONTHS?$/i);
  if (m) return Math.max(1, parseInt(m[1], 10));
  return null;
};

export const addCalendarMonthsToYmd = (ymd, months) => {
  if (!ymd || months == null || months < 1) return null;
  const p = String(ymd).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!p) return null;
  const d = new Date(parseInt(p[1], 10), parseInt(p[2], 10) - 1, parseInt(p[3], 10));
  if (isNaN(d.getTime())) return null;
  d.setMonth(d.getMonth() + months);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
};

export const billingContractExclusiveEndYmdFirstOfMonthJs = (startYmd, termMonths) => {
  if (!startYmd || termMonths < 1) return null;
  const p = String(startYmd).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!p) return null;
  const y = parseInt(p[1], 10);
  const mo = parseInt(p[2], 10);
  const day = parseInt(p[3], 10);
  const start = new Date(y, mo - 1, day);
  if (isNaN(start.getTime())) return null;
  if (day === 1) {
    start.setMonth(start.getMonth() + termMonths);
  } else {
    const firstAnchor = new Date(y, mo, 1);
    firstAnchor.setMonth(firstAnchor.getMonth() + (termMonths - 1));
    return `${firstAnchor.getFullYear()}-${String(firstAnchor.getMonth() + 1).padStart(2, '0')}-${String(firstAnchor.getDate()).padStart(2, '0')}`;
  }
  return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
};

export const contractBillingEndYmdForBankForm = (startYmd, termMonths, frequency) => {
  if (!startYmd || termMonths == null || termMonths < 1) return null;
  if (frequency === 'monthly') return addCalendarMonthsToYmd(startYmd, termMonths);
  return billingContractExclusiveEndYmdFirstOfMonthJs(startYmd, termMonths);
};
