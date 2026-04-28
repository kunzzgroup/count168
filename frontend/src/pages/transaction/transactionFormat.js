function cleanNumberLike(value) {
  if (value === "-" || value === null || value === undefined) return null;
  const cleaned = String(value).replace(/,/g, "").trim();
  if (!cleaned || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function toUpperDisplay(value) {
  if (value === null || value === undefined) return "-";
  const str = String(value).trim();
  return str ? str.toUpperCase() : "-";
}

// Keep legacy behavior: show '-' stays '-', otherwise always 2 decimals with thousand separators.
export function formatMoney2(value) {
  const n = cleanNumberLike(value);
  if (n === null) return value === "-" ? "-" : "0.00";
  const fixed = (Math.trunc((n + Number.EPSILON) * 100) / 100).toFixed(2);
  const parts = fixed.split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return parts.join(".");
}

export function parseBalanceValue(value) {
  const n = cleanNumberLike(value);
  return n === null ? null : n;
}

export function formatDmy(date) {
  const d = date instanceof Date ? date : new Date(date);
  const day = String(d.getDate()).padStart(2, "0");
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const y = d.getFullYear();
  return `${day}/${m}/${y}`;
}

export function buildClientRequestId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
  return `tx_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

