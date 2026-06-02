import { formatPaymentHistoryMoneyHalfUp } from "../lib/transactionFormat.js";

function parseMoneyNumber(value) {
  if (value === "-" || value === null || value === undefined) return null;
  const cleaned = String(value).replace(/,/g, "").trim();
  if (cleaned === "" || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Win/Loss column: positive #0b2557, negative #b91c1c (aligned with member-amount). */
export default function TransactionWinLossCell({ value }) {
  const display = formatPaymentHistoryMoneyHalfUp(value);
  const n = parseMoneyNumber(value);
  if (n === null || n === 0) return display;

  const tone = n > 0 ? "pos" : "neg";
  return <span className={`transaction-amount transaction-amount--${tone}`}>{display}</span>;
}
