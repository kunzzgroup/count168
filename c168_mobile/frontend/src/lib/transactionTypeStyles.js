/**
 * Payment History / TX type badge styles — one distinct color per payment type.
 */

const TYPE_BADGE = {
  CONTRA: "bg-violet-100 text-violet-800 ring-violet-200/80",
  PAYMENT: "bg-sky-100 text-sky-800 ring-sky-200/80",
  CLAIM: "bg-amber-100 text-amber-900 ring-amber-200/80",
  PROFIT: "bg-emerald-100 text-emerald-800 ring-emerald-200/80",
  WIN: "bg-emerald-100 text-emerald-800 ring-emerald-200/80",
  LOSE: "bg-emerald-100 text-emerald-800 ring-emerald-200/80",
  RATE: "bg-indigo-100 text-indigo-800 ring-indigo-200/80",
  ADJUSTMENT: "bg-orange-100 text-orange-900 ring-orange-200/80",
  CLEAR: "bg-slate-200 text-slate-700 ring-slate-300/80",
};

const FALLBACK_BADGE = "bg-slate-100 text-slate-600 ring-slate-200/80";

/** @param {object|null|undefined} row */
export function normalizeHistoryType(row) {
  if (!row || row.row_type === "bf") return "BF";
  const raw = String(row.transaction_type || row.product || "")
    .trim()
    .toUpperCase();
  if (!raw || raw === "-") return "";
  return raw;
}

/** Display label for type badge (BF / bank process / type). */
export function historyTypeLabel(row) {
  if (!row) return "—";
  if (row.row_type === "bf") return "B/F";
  if (row.is_bank_process_transaction) {
    return String(row.card_owner || row.product || "BANK").trim().toUpperCase() || "BANK";
  }
  const t = normalizeHistoryType(row);
  return t || "—";
}

/** Tailwind classes for the type chip (includes ring). */
export function historyTypeBadgeClass(row) {
  if (!row || row.row_type === "bf") {
    return "bg-amber-100 text-amber-900 ring-amber-200/80";
  }
  if (row.is_bank_process_transaction) {
    return FALLBACK_BADGE;
  }
  const t = normalizeHistoryType(row);
  return TYPE_BADGE[t] || FALLBACK_BADGE;
}
