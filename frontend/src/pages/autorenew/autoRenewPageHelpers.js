import { calculateCountdown } from "../domain/domainHelpers.js";

export const AUTO_RENEW_PAGE_SIZE = 20;

export function periodToLabelKey(period) {
  const map = {
    "7days": "period7days",
    "1month": "period1month",
    "3months": "period3months",
    "6months": "period6months",
    "1year": "period1year",
  };
  return map[period] || null;
}

export function formatRemainingForRow(row, t) {
  if (!row?.expiration_date) return t("noExpirationDate");
  const countdown = calculateCountdown(row.expiration_date);
  if (countdown?.text) return countdown.text;
  const days = row.days_until_expiration;
  if (days == null) return t("notSet");
  if (days < 0) return t("expExpired");
  if (days === 0) return t("expToday");
  return t("expDaysLeft", { days });
}

export function rowMatchesSearch(row, searchTerm) {
  const q = String(searchTerm || "").trim().toUpperCase();
  if (!q) return true;
  const company = String(row.company_code || "").toUpperCase();
  const name = String(row.owner_name || "").toUpperCase();
  const group = String(row.group_id || "").toUpperCase();
  return company.includes(q) || name.includes(q) || group.includes(q);
}

export function filterAutoRenewRows(rows, { searchTerm }) {
  return (Array.isArray(rows) ? rows : []).filter((row) => rowMatchesSearch(row, searchTerm));
}

export function sortAutoRenewRows(rows, sortColumn, sortDirection) {
  const list = [...rows];
  const dir = sortDirection === "desc" ? -1 : 1;

  list.sort((a, b) => {
    let av;
    let bv;
    switch (sortColumn) {
      case "name":
        av = String(a.owner_name || "").toUpperCase();
        bv = String(b.owner_name || "").toUpperCase();
        break;
      case "price":
        av = parseFloat(a.price || "0") || 0;
        bv = parseFloat(b.price || "0") || 0;
        break;
      case "group":
        av = String(a.group_id || "").toUpperCase();
        bv = String(b.group_id || "").toUpperCase();
        break;
      case "expiration":
        av = a.expiration_date || "";
        bv = b.expiration_date || "";
        break;
      case "remaining":
        av = a.days_until_expiration ?? 999999;
        bv = b.days_until_expiration ?? 999999;
        break;
      case "status":
        av = String(a.status || "");
        bv = String(b.status || "");
        break;
      case "period":
        av = String(a.period || "");
        bv = String(b.period || "");
        break;
      case "company":
      default:
        av = String(a.company_code || "").toUpperCase();
        bv = String(b.company_code || "").toUpperCase();
        break;
    }
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });

  return list;
}

export function paginateRows(rows, page, pageSize = AUTO_RENEW_PAGE_SIZE) {
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    page: safePage,
    totalPages,
    total,
    rows: rows.slice(start, start + pageSize),
  };
}

export function getRowDraftValues(row, drafts) {
  const draft = drafts[row.request_id] || {};
  return {
    period: draft.period ?? row.period ?? "",
    fromAccountId: draft.fromAccountId ?? row.from_account_id ?? row.default_from_account_id ?? "",
    toAccountId: draft.toAccountId ?? row.to_account_id ?? "",
  };
}

export function canApproveRow(row, drafts) {
  if (row.status !== "pending" || !row.can_approve) return false;
  const { period, fromAccountId, toAccountId } = getRowDraftValues(row, drafts);
  return Boolean(period && fromAccountId && toAccountId && row.price);
}

/** DD/MM/YYYY HH:mm:ss for Submitter tooltip (Payment Maintenance style). */
export function formatSubmitterTooltip(processedAt) {
  if (!processedAt) return "";
  const s = String(processedAt).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}:\d{2}:\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]} ${m[4]}`;
  return s;
}
