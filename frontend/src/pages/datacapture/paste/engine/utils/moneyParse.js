/**
 * Money helpers for Universal Paste — always MoneyDecimal, never parseFloat.
 */
import {
  cleanMoneyInput,
  toDecimal,
  formatDisplay,
} from "../../../../../utils/money/moneyDecimal.js";

export function tryParseMoney(value) {
  try {
    const cleaned = cleanMoneyInput(value);
    if (cleaned === "") return null;
    const d = toDecimal(cleaned);
    return d;
  } catch {
    return null;
  }
}

export function normalizeMoneyCell(value) {
  const d = tryParseMoney(value);
  if (!d) return String(value ?? "").trim();
  return formatDisplay(d, 8);
}

export function isValidMoneyCell(value) {
  return tryParseMoney(value) != null;
}
