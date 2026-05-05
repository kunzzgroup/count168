function cleanNumberLike(value) {
  if (value === "-" || value === null || value === undefined) return null;
  const cleaned = String(value).replace(/,/g, "").trim();
  if (!cleaned || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Round to `decimals` places using half-up (四舍五入), aligned with legacy `MoneyDecimal.formatFixedHalfUp` / Decimal.ROUND_HALF_UP.
 * Prefer parsing decimal strings so values like "1.005" round correctly despite IEEE floats.
 */
export function roundMoneyHalfUp(value, decimals = 2) {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return 0;
    const wide = String(Number.prototype.toFixed.call(value, 14));
    return roundMoneyHalfUp(wide, decimals);
  }
  let raw = String(value).replace(/,/g, "").trim();
  if (raw === "" || raw === "-") return 0;
  const neg = raw[0] === "-";
  let unsigned = neg ? raw.slice(1) : raw;
  if (/e|E/.test(unsigned)) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return 0;
    return roundMoneyHalfUp(n, decimals);
  }
  if (!/^\d*\.?\d*$/.test(unsigned)) {
    const n = Number(raw);
    return Number.isFinite(n) ? roundMoneyHalfUp(n, decimals) : 0;
  }
  if (unsigned.startsWith(".")) unsigned = "0" + unsigned;
  const [intPartRaw, fracRaw = ""] = unsigned.split(".");
  const intPart = intPartRaw === "" ? "0" : intPartRaw;
  const keep = (fracRaw + "0".repeat(decimals)).slice(0, decimals);
  const roundDigit = parseInt((fracRaw + "0".repeat(decimals + 1)).charAt(decimals) || "0", 10);
  const scale = 10n ** BigInt(decimals);
  let subunits = BigInt(intPart) * scale + BigInt(keep);
  if (roundDigit >= 5) subunits += 1n;
  const out = Number(subunits) / Number(scale);
  return neg ? -out : out;
}

/**
 * Snap to nearest 0.50 after 2dp half-up (五毫进位). Removes “odd cents” like -0.37 / -1.77 in the transaction grid.
 */
export function roundMoneyNearestHalf(value) {
  const r = roundMoneyHalfUp(value, 2);
  const fixed = r.toFixed(2);
  const neg = fixed.startsWith("-");
  const body = neg ? fixed.slice(1) : fixed;
  const [intP, fracP = "00"] = body.split(".");
  const frac2 = (fracP + "00").slice(0, 2);
  const cents = BigInt(intP) * 100n + BigInt(frac2);
  const signedCents = neg ? -cents : cents;
  const roundedCents = Math.round(Number(signedCents) / 50) * 50;
  return roundedCents / 100;
}

export function toUpperDisplay(value) {
  if (value === null || value === undefined) return "-";
  const str = String(value).trim();
  return str ? str.toUpperCase() : "-";
}

/** Payment History Remark：优先 remark，否则 sms（与 js/transaction.js getHistoryRemark 一致）。 */
export function getHistoryRemark(row) {
  if (row?.remark != null && String(row.remark).trim() !== "") {
    return toUpperDisplay(row.remark);
  }
  return toUpperDisplay(row?.sms || "-");
}

// Show '-' stays '-', otherwise 2 decimals (nearest 0.50) with thousand separators.
export function formatMoney2(value) {
  const n = cleanNumberLike(value);
  if (n === null) return value === "-" ? "-" : "0.00";
  const rounded = roundMoneyNearestHalf(value);
  const fixed = rounded.toFixed(2);
  const parts = fixed.split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return parts.join(".");
}

/**
 * Main grid + totals: 2dp half-up then nearest 0.50 (五毫), then thousands.
 */
export function formatPaymentHistoryMoney(value) {
  if (value === "-" || value === null || value === undefined) return "-";
  const cleaned = String(value).replace(/,/g, "").trim();
  if (cleaned === "" || cleaned === "-") return "0.00";
  const rounded = roundMoneyNearestHalf(cleaned);
  return rounded.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatHistoryMoney(v) {
  return v === "-" ? "-" : formatPaymentHistoryMoney(v);
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
  const raw = String(value ?? "").replace(/,/g, "").trim();
  const rounded = roundMoneyHalfUp(raw || "0", 2);
  return rounded.toFixed(2);
}

