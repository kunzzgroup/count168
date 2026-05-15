export function safeEvalNumber(expression) {
  const raw = String(expression ?? "").trim();
  const accountingOnlyMatch = raw.match(/^\(\s*([+-]?\d+(?:\.\d+)?)\s*\)$/);
  const normalizedRaw = accountingOnlyMatch ? `-${accountingOnlyMatch[1]}` : raw;
  const sanitized = normalizedRaw.replace(/,/g, "").trim();
  if (!sanitized) return 0;
  const safe = sanitized.replace(/[^0-9+\-*/().\s]/g, "");
  if (!safe) return 0;
  try {
    // eslint-disable-next-line no-new-func
    const value = Number(Function(`"use strict"; return (${safe});`)());
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

export function parseLooseNumericInput(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return Number.NaN;
  const accountingOnlyMatch = raw.match(/^\(\s*([+-]?\d+(?:\.\d+)?)\s*\)$/);
  const normalizedRaw = accountingOnlyMatch ? `-${accountingOnlyMatch[1]}` : raw;
  const sanitized = normalizedRaw.replace(/,/g, "").trim();
  if (!sanitized) return Number.NaN;
  const safe = sanitized.replace(/[^0-9+\-*/().\s]/g, "");
  if (!safe || safe !== sanitized) return Number.NaN;
  try {
    // eslint-disable-next-line no-new-func
    const valueNum = Number(Function(`"use strict"; return (${safe});`)());
    return Number.isFinite(valueNum) ? valueNum : Number.NaN;
  } catch {
    return Number.NaN;
  }
}

export function normalizeSourceMultiplier(sourcePercent) {
  const raw = String(sourcePercent ?? "").trim();
  if (!raw) return 1;
  if (raw.endsWith("%")) {
    const percent = parseLooseNumericInput(raw.slice(0, -1));
    return Number.isFinite(percent) ? percent / 100 : 1;
  }
  const evaluated = parseLooseNumericInput(raw);
  return Number.isFinite(evaluated) ? evaluated : 1;
}

export function applyRateExpression(amount, rateExpr) {
  const expr = String(rateExpr || "").trim();
  if (!expr) return amount;
  const operator = expr[0];
  const value = parseLooseNumericInput(expr.slice(1));
  if (!Number.isFinite(value) || (operator !== "*" && operator !== "/")) return amount;
  if (operator === "/" && value === 0) return amount;
  return operator === "*" ? amount * value : amount / value;
}

export function formatFixed2(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(2) : "0.00";
}

export function parseDisplayAmountToNumber(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  const normalized = raw.startsWith("(") && raw.endsWith(")") ? `-${raw.slice(1, -1)}` : raw;
  const parsed = Number.parseFloat(normalized.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatAmountDisplay(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0.00";
  const abs = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `(${abs})` : abs;
}

export function computeProcessedAmounts(formula, sourcePercent, rateValue) {
  const formulaValue = safeEvalNumber(formula);
  const sourceMultiplier = normalizeSourceMultiplier(sourcePercent);
  const base = formulaValue * sourceMultiplier;
  const final = applyRateExpression(base, rateValue);
  return {
    baseProcessedAmount: formatFixed2(base),
    processedAmount: formatFixed2(final),
  };
}
