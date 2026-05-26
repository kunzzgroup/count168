import { calculateCountdown } from "../domain/domainHelpers.js";

export const AUTO_RENEW_PAGE_SIZE = 20;

export const AUTO_RENEW_FILTER_KEYS = [
  "showAutoRenew",
  "autoRenewOff",
  "expiringSoon",
  "expired",
  "noExpiration",
];

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
  const group = String(row.group_id || "").toUpperCase();
  return company.includes(q) || group.includes(q);
}

export function rowMatchesFilters(row, filters) {
  const active = AUTO_RENEW_FILTER_KEYS.filter((key) => filters[key]);
  if (active.length === 0) return true;

  const days = row.days_until_expiration;
  const hasExp = Boolean(row.expiration_date);
  const enabled = Boolean(row.auto_renew_enabled);

  const checks = {
    showAutoRenew: enabled,
    autoRenewOff: !enabled,
    expiringSoon: hasExp && days != null && days >= 0 && days <= 30,
    expired: hasExp && days != null && days < 0,
    noExpiration: !hasExp,
  };

  return active.some((key) => checks[key]);
}

export function filterAutoRenewRows(rows, { searchTerm, filters }) {
  return (Array.isArray(rows) ? rows : []).filter(
    (row) => rowMatchesSearch(row, searchTerm) && rowMatchesFilters(row, filters),
  );
}

export function sortAutoRenewRows(rows, sortColumn, sortDirection) {
  const list = [...rows];
  const dir = sortDirection === "desc" ? -1 : 1;

  list.sort((a, b) => {
    let av;
    let bv;
    switch (sortColumn) {
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
      case "autoRenew":
        av = a.auto_renew_enabled ? 1 : 0;
        bv = b.auto_renew_enabled ? 1 : 0;
        break;
      case "period":
        av = String(a.auto_renew_period || "");
        bv = String(b.auto_renew_period || "");
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
