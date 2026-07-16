/**
 * Payment History / TX type styles — badge + full-card outline tint (B/F-like).
 */

const TYPE_BADGE = {
  CONTRA: "bg-violet-100 text-violet-800 ring-violet-300",
  PAYMENT: "bg-sky-100 text-sky-800 ring-sky-300",
  CLAIM: "bg-amber-100 text-amber-900 ring-amber-300",
  PROFIT: "bg-emerald-100 text-emerald-800 ring-emerald-300",
  WIN: "bg-emerald-100 text-emerald-800 ring-emerald-300",
  LOSE: "bg-emerald-100 text-emerald-800 ring-emerald-300",
  RATE: "bg-indigo-100 text-indigo-800 ring-indigo-300",
  ADJUSTMENT: "bg-orange-100 text-orange-900 ring-orange-300",
  CLEAR: "bg-slate-200 text-slate-700 ring-slate-400",
};

/** Card shell: tinted fill + stronger colored ring (same language as B/F amber). */
const TYPE_CARD = {
  CONTRA: "bg-violet-50 ring-2 ring-violet-300",
  PAYMENT: "bg-sky-50 ring-2 ring-sky-300",
  CLAIM: "bg-amber-50 ring-2 ring-amber-300",
  PROFIT: "bg-emerald-50 ring-2 ring-emerald-300",
  WIN: "bg-emerald-50 ring-2 ring-emerald-300",
  LOSE: "bg-emerald-50 ring-2 ring-emerald-300",
  RATE: "bg-indigo-50 ring-2 ring-indigo-300",
  ADJUSTMENT: "bg-orange-50 ring-2 ring-orange-300",
  CLEAR: "bg-slate-100 ring-2 ring-slate-300",
};

const FALLBACK_BADGE = "bg-slate-100 text-slate-600 ring-slate-300";
const FALLBACK_CARD = "bg-white ring-2 ring-slate-200";
const BF_BADGE = "bg-amber-100 text-amber-900 ring-amber-300";
const BF_CARD = "bg-amber-50 ring-2 ring-amber-300";

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
  if (!row || row.row_type === "bf") return BF_BADGE;
  if (row.is_bank_process_transaction) return FALLBACK_BADGE;
  const t = normalizeHistoryType(row);
  return TYPE_BADGE[t] || FALLBACK_BADGE;
}

/** Full-card outline + tint — same visual weight as B/F for every type. */
export function historyTypeCardClass(row) {
  if (!row || row.row_type === "bf") return BF_CARD;
  if (row.is_bank_process_transaction) return FALLBACK_CARD;
  const t = normalizeHistoryType(row);
  return TYPE_CARD[t] || FALLBACK_CARD;
}
