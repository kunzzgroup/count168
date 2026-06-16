import { summaryRefreshStorageKeys } from "./summaryRefreshStorageKeys.js";
import {
  SUMMARY_FORMULA_SOURCE_KEY,
  SUMMARY_RATE_VALUES_KEY,
} from "./summaryStorage.js";
import { RATE_BY_PRODUCT_KEY } from "./summaryRefreshStorageKeys.js";

/** Persist formula/rate draft before refresh or back (pure React, scoped by capture ledger). */
export function saveSummaryRefreshStatePure(rows, processMeta, captureScope = null) {
  try {
    const keys = summaryRefreshStorageKeys(captureScope);
    const payload = {
      processId: processMeta?.processId ?? null,
      processCode: processMeta?.processCode ?? "",
      rowOrder: rows.map((r) => r.key),
      rows: rows
        .filter((r) => r.account?.trim() || r.formulaOperators || r.formulaDisplay)
        .map((row) => ({
          idProduct: row.idProduct,
          displayOrder: row.rowIndex,
          account: row.account,
          accountId: row.accountId,
          currency: row.currency,
          currencyId: row.currencyId,
          formula: row.formulaDisplay || row.formula,
          formulaOperators: row.formulaOperators,
          sourcePercent: row.sourcePercent,
          processedAmount: row.processedAmount,
          baseProcessedAmount: row.baseProcessedAmount,
          rateChecked: row.rateChecked,
          rateValue: row.rateValue,
          selectChecked: row.selectChecked,
          productType: row.productType,
          subOrder: row.subOrder,
        })),
    };
    localStorage.setItem(keys.formulaSource, JSON.stringify(payload));

    const rateMap = {};
    const rateByProduct = {};
    for (const row of rows) {
      if (!row.rateChecked && !row.rateValue) continue;
      const key = row.key;
      rateMap[key] = { checked: row.rateChecked, value: row.rateValue || "" };
      if (row.idProduct) {
        rateByProduct[row.idProduct] = { checked: row.rateChecked, value: row.rateValue || "" };
      }
    }
    localStorage.setItem(keys.rateValues, JSON.stringify(rateMap));
    localStorage.setItem(keys.rateByProduct, JSON.stringify(rateByProduct));
  } catch {
    /* ignore */
  }
}

/** Clear formula/rate refresh draft (fresh capture — avoid stale F5 restore). */
export function clearSummaryRefreshDraftStorage(captureScope = null) {
  try {
    const keys = summaryRefreshStorageKeys(captureScope);
    localStorage.removeItem(keys.formulaSource);
    localStorage.removeItem(keys.rateValues);
    localStorage.removeItem(keys.rateByProduct);
    localStorage.removeItem(SUMMARY_FORMULA_SOURCE_KEY);
    localStorage.removeItem(SUMMARY_RATE_VALUES_KEY);
    localStorage.removeItem(RATE_BY_PRODUCT_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Resolve refresh payload for repopulate: localStorage first (pure React writes `.rows`),
 * then server state only when it uses the same array shape.
 */
export function resolveSummaryRefreshSavedState(serverState, captureScope, processMeta = null) {
  const fromLocal = loadSummaryRefreshFormulaState(captureScope, processMeta);
  if (fromLocal?.rows?.length) return fromLocal;

  if (
    serverState &&
    typeof serverState === "object" &&
    Array.isArray(serverState.rows) &&
    serverState.rows.length > 0
  ) {
    return serverState;
  }

  return null;
}

/** Read refresh formula payload; prefers scoped key, falls back to legacy global key. */
export function loadSummaryRefreshFormulaState(captureScope, processMeta = null) {
  const keys = summaryRefreshStorageKeys(captureScope);
  const candidates = [keys.formulaSource, SUMMARY_FORMULA_SOURCE_KEY];
  for (const storageKey of candidates) {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.rows)) continue;
      if (processMeta?.processId != null && parsed.processId != null) {
        if (String(parsed.processId) !== String(processMeta.processId)) continue;
      }
      if (processMeta?.processCode && parsed.processCode) {
        if (
          String(parsed.processCode).trim().toUpperCase() !==
          String(processMeta.processCode).trim().toUpperCase()
        ) {
          continue;
        }
      }
      return parsed;
    } catch {
      /* try next */
    }
  }
  return null;
}
