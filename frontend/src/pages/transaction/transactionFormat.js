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

/**
 * Main grid + totals: align with legacy MoneyDecimal-style display (avoid trunc quirks on pre-rounded API strings).
 */
export function formatPaymentHistoryMoney(value) {
  if (value === "-" || value === null || value === undefined) return "-";
  const cleaned = String(value).replace(/,/g, "").trim();
  if (cleaned === "" || cleaned === "-") return "0.00";
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return "0.00";
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

export function parseRateExpression(rawValue) {
  const raw = String(rawValue ?? "").trim();
  if (!raw) return { valid: false, value: 0 };
  const normalized = raw.replace(/÷/g, "/").replace(/\s+/g, "");
  if (!normalized) return { valid: false, value: 0 };

  // Support "/3" meaning 1/3
  if (/^\/\d*\.?\d+$/.test(normalized)) {
    const divisor = Number(normalized.slice(1));
    if (!Number.isFinite(divisor) || divisor <= 0) return { valid: false, value: 0 };
    return { valid: true, value: 1 / divisor };
  }

  if (!/^[0-9.*/]+$/.test(normalized)) return { valid: false, value: 0 };
  if (/^[*/]|[*/]$|[*/]{2,}/.test(normalized)) return { valid: false, value: 0 };

  const tokens = normalized.split(/([*/])/).filter(Boolean);
  if (tokens.length === 0) return { valid: false, value: 0 };
  if (!/^\d*\.?\d+$/.test(tokens[0])) return { valid: false, value: 0 };

  let result = Number(tokens[0]);
  if (!Number.isFinite(result) || result <= 0) return { valid: false, value: 0 };

  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i];
    const rhs = Number(tokens[i + 1]);
    if (!Number.isFinite(rhs) || rhs <= 0) return { valid: false, value: 0 };
    if (op === "*") result *= rhs;
    else if (op === "/") result /= rhs;
    else return { valid: false, value: 0 };
    if (!Number.isFinite(result) || result <= 0) return { valid: false, value: 0 };
  }
  return { valid: true, value: result };
}

export function formatRateAmount(value) {
  const n = Number(String(value ?? "").replace(/,/g, "").trim());
  if (!Number.isFinite(n)) return "0.00";
  // Backend normalizes; keep 2dp string for stability.
  return n.toFixed(2);
}

