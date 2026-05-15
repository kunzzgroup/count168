import { MoneyDecimal } from "../../../utils/moneyDecimal.js";

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

/** Same as js/datacapturesummary.js truncateProcessedAmountTo6Decimals (sum parts only). */
export function truncateProcessedAmountTo6Decimals(value) {
  try {
    return MoneyDecimal.formatFixed(value, 6);
  } catch {
    return "0.000000";
  }
}

/** Same as js/datacapturesummary.js roundProcessedAmountTo2Decimals — half-up 2dp for total check. */
export function roundProcessedAmountTo2DecimalsHalfUp(value) {
  try {
    return MoneyDecimal.formatFixedHalfUp(value, 2);
  } catch {
    return "0.00";
  }
}

/**
 * Replicates submitSummaryData() total validation:
 * per-row display amount → truncate 6dp → sum → half-up 2dp → compare to [-0.05, 0.05].
 */
export function legacySubmitTotalTolerance(summaryRows) {
  let totalAmount = MoneyDecimal.toDecimal("0", 0);
  let hasValue = false;

  for (const row of summaryRows) {
    if (row?.skipChecked) continue;
    const cleaned = MoneyDecimal.cleanMoneyInput(row?.processedAmount);
    if (cleaned === "") continue;
    const rowForTotal = truncateProcessedAmountTo6Decimals(cleaned);
    try {
      totalAmount = totalAmount.plus(MoneyDecimal.toDecimal(String(rowForTotal), 0));
      hasValue = true;
    } catch {
      /* ignore invalid row amount */
    }
  }

  const finalTotalRaw = hasValue ? totalAmount.toString() : "0";
  const finalTotal = roundProcessedAmountTo2DecimalsHalfUp(finalTotalRaw);
  const ok = MoneyDecimal.cmp(finalTotal, "-0.05") >= 0 && MoneyDecimal.cmp(finalTotal, "0.05") <= 0;
  let formattedTotal = finalTotal;
  try {
    formattedTotal = MoneyDecimal.formatThousands(finalTotal, 2);
  } catch {
    formattedTotal = finalTotal;
  }
  return { ok, finalTotal, formattedTotal };
}

/**
 * Rows with a real chosen account must have currency + formula (legacy submit pre-check).
 */
export function legacyRowCurrencyFormulaOk(row) {
  if (row?.skipChecked) return true;
  const accountText = String(row?.account || "").trim();
  const hasRealAccount =
    row?.accountId != null && Number(row.accountId) > 0 && accountText !== "" && accountText !== "+";
  if (!hasRealAccount) return true;

  const cur = String(row?.currency || "")
    .trim()
    .replace(/[()]/g, "");
  const formula = String(row?.formula || "").trim();
  const currencyEmpty = !cur || /^select\s*curren/i.test(cur);
  const formulaEmpty = !formula;
  return !currencyEmpty && !formulaEmpty;
}
