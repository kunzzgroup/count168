import { parseBalanceValue, roundMoneyNearestHalf } from "./transactionFormat.js";

export const TRANSACTION_CURRENCY_FILTER_KEY_PREFIX = "transaction_currency_filter_v1_";
export const TX_LIST_SESSION_PREFIX = "count168_txlist_v1_";
export const TX_LIST_INVALIDATE_LS_KEY = "count168_tx_invalidate_ts";
export const TX_DATA_CHANGED_EVENT = "tx-data-changed";

/** @param {string|null|undefined} role */
export function getRoleClass(role) {
  if (!role) return "";
  const roleLower = String(role).toLowerCase().trim();
  const roleMap = {
    capital: "transaction-role-capital",
    bank: "transaction-role-bank",
    cash: "transaction-role-cash",
    profit: "transaction-role-profit",
    expenses: "transaction-role-expenses",
    company: "transaction-role-company",
    partner: "transaction-role-partner",
    staff: "transaction-role-staff",
    upline: "transaction-role-upline",
    agent: "transaction-role-agent",
    member: "transaction-role-member",
    debtor: "transaction-role-debtor",
    none: "transaction-role-none",
  };
  return roleMap[roleLower] || "";
}

export function getRoleSortOrder(role) {
  if (!role) return 999;
  const roleLower = String(role).toLowerCase().trim();
  const roleOrder = {
    capital: 1,
    bank: 2,
    cash: 3,
    profit: 4,
    expenses: 5,
    company: 6,
    staff: 7,
    upline: 8,
    agent: 9,
    member: 10,
    none: 11,
  };
  return roleOrder[roleLower] ?? 999;
}

export function sortByRole(data) {
  return [...(data || [])].sort((a, b) => {
    const roleA = getRoleSortOrder(a.role);
    const roleB = getRoleSortOrder(b.role);
    if (roleA !== roleB) return roleA - roleB;
    return String(a.account_id || "").localeCompare(String(b.account_id || ""));
  });
}

/** 与 search_api.php 去重键一致：account_db_id + currency（防止异常重复行）。 */
export function dedupeRowsByAccountAndCurrency(rows) {
  const out = [];
  const indexByKey = new Map();
  const norm = (v) => String(v || "").toUpperCase().trim();
  const keyOf = (row) => {
    const currency = norm(row?.currency);
    // Prefer stable UI identity (account_id). account_db_id is fallback only.
    const accountCode = norm(row?.account_id);
    const accountDbId = norm(row?.account_db_id);
    const anchor = accountCode || `DB:${accountDbId}`;
    return `${anchor}_${currency}`;
  };
  const toAbs = (v) => Math.abs(parseBalanceValue(v) ?? 0);
  const toBoolFlag = (v) => {
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return v !== 0;
    return parseInt(String(v || "0"), 10) !== 0;
  };
  const scoreRow = (row) => {
    if (!row || typeof row !== "object") return 0;
    // Prefer rows that actually carry transaction signals / non-zero metrics.
    const score =
      toAbs(row.win_loss) * 100 +
      toAbs(row.cr_dr) * 80 +
      toAbs(row.balance) * 20 +
      toAbs(row.bf) * 10 +
      (toBoolFlag(row.has_win_loss_transactions) ? 5000 : 0) +
      (toBoolFlag(row.has_crdr_transactions) ? 5000 : 0) +
      (toBoolFlag(row.has_win_loss_history) ? 2000 : 0);
    return score;
  };

  for (const row of rows || []) {
    const k = keyOf(row);
    if (!indexByKey.has(k)) {
      indexByKey.set(k, out.length);
      out.push(row);
      continue;
    }
    const idx = indexByKey.get(k);
    const prev = out[idx];
    if (scoreRow(row) >= scoreRow(prev)) {
      out[idx] = row;
    }
  }
  return out;
}

/** 去重左右表并按行重算 totals（修复竞态/缓存叠行导致的重复 CAPITAL 等）。 */
export function sanitizeSearchApiData(data) {
  if (!data || typeof data !== "object") return data;
  const left = dedupeRowsByAccountAndCurrency(data.left_table);
  const right = dedupeRowsByAccountAndCurrency(data.right_table);
  const totalsLeft = calculateTotals(left);
  const totalsRight = calculateTotals(right);
  return {
    ...data,
    left_table: left,
    right_table: right,
    totals: {
      left: totalsLeft,
      right: totalsRight,
      summary: mergeTotals(totalsLeft, totalsRight),
    },
  };
}

function absDecimalGt(value, eps = 1e-5) {
  const n = parseBalanceValue(value);
  if (n === null) return false;
  return Math.abs(n) > eps;
}

export function rowPassesHideZeroBalanceFilter(showZero, row) {
  if (showZero) return true;
  const num = parseBalanceValue(row.balance);
  if (num === null) return true;
  if (Math.abs(num) > 1e-5) return true;
  const flagToBool = (v) => {
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return v !== 0;
    return parseInt(String(v || "0"), 10) !== 0;
  };
  const absVal = (v) => Math.abs(parseBalanceValue(v) ?? 0);
  const hasTxnFlag =
    flagToBool(row.has_win_loss_history) ||
    flagToBool(row.has_win_loss_transactions) ||
    flagToBool(row.has_crdr_transactions);
  return hasTxnFlag || absVal(row.bf) > 1e-5 || absVal(row.win_loss) > 1e-5 || absVal(row.cr_dr) > 1e-5;
}

export function normalizeRateRowsByCrDr(leftRows, rightRows, isRate) {
  const safeLeft = Array.isArray(leftRows) ? leftRows : [];
  const safeRight = Array.isArray(rightRows) ? rightRows : [];
  if (!isRate) {
    return { leftRows: [...safeLeft], rightRows: [...safeRight] };
  }
  const normalizedLeft = [];
  const normalizedRight = [];
  safeLeft.forEach((row) => {
    const crDr = parseBalanceValue(row?.cr_dr);
    if (crDr === null || Math.abs(crDr) < 1e-5) {
      normalizedLeft.push(row);
      return;
    }
    if (crDr > 0) normalizedLeft.push(row);
    else normalizedRight.push(row);
  });
  safeRight.forEach((row) => {
    const crDr = parseBalanceValue(row?.cr_dr);
    if (crDr === null || Math.abs(crDr) < 1e-5) {
      normalizedRight.push(row);
      return;
    }
    if (crDr > 0) normalizedLeft.push(row);
    else normalizedRight.push(row);
  });
  return { leftRows: normalizedLeft, rightRows: normalizedRight };
}

export function applyPaymentWinLossFilters(rawLeft, rawRight, { showPaymentOnly, showCaptureOnly }) {
  let filteredLeft = rawLeft;
  let filteredRight = rawRight;
  if (!showPaymentOnly) {
    return { filteredLeft, filteredRight };
  }
  const hasCrdr = (row) => {
    const byFlag =
      typeof row.has_crdr_transactions === "boolean"
        ? row.has_crdr_transactions
        : typeof row.has_crdr_transactions === "number"
          ? row.has_crdr_transactions !== 0
          : parseInt(row.has_crdr_transactions || "0", 10) !== 0;
    const crdr = parseBalanceValue(row.cr_dr);
    const byValue = crdr !== null && Math.abs(crdr) > 1e-5;
    return byFlag || byValue;
  };
  const hasWinLoss = (row) => {
    const byFlag =
      typeof row.has_win_loss_transactions === "boolean"
        ? row.has_win_loss_transactions
        : typeof row.has_win_loss_transactions === "number"
          ? row.has_win_loss_transactions !== 0
          : parseInt(row.has_win_loss_transactions || "0", 10) !== 0;
    const wl = parseBalanceValue(row.win_loss);
    const byValue = wl !== null && Math.abs(wl) > 1e-5;
    return byFlag || byValue;
  };
  const shouldShow = showCaptureOnly ? (row) => hasCrdr(row) || hasWinLoss(row) : hasCrdr;
  filteredLeft = rawLeft.filter(shouldShow);
  filteredRight = rawRight.filter(shouldShow);
  return { filteredLeft, filteredRight };
}

export function applyZeroBalanceFilter(filteredLeft, filteredRight, showZeroBalance) {
  const fn = (row) => rowPassesHideZeroBalanceFilter(showZeroBalance, row);
  return {
    left: filteredLeft.filter(fn),
    right: filteredRight.filter(fn),
  };
}

export function calculateTotals(rows) {
  const sumField = (field) =>
    (rows || []).reduce((acc, row) => {
      const n = parseBalanceValue(row[field]);
      return acc + (n ?? 0);
    }, 0);

  const bf = sumField("bf");
  const win_loss = sumField("win_loss");
  const cr_dr = sumField("cr_dr");
  const balance = sumField("balance");
  return {
    bf: roundMoneyNearestHalf(bf).toFixed(2),
    win_loss: roundMoneyNearestHalf(win_loss).toFixed(2),
    cr_dr: roundMoneyNearestHalf(cr_dr).toFixed(2),
    balance: roundMoneyNearestHalf(balance).toFixed(2),
  };
}

export function mergeTotals(leftT, rightT) {
  const add = (a, b) => roundMoneyNearestHalf(parseFloat(a || 0) + parseFloat(b || 0)).toFixed(2);
  return {
    bf: add(leftT.bf, rightT.bf),
    win_loss: add(leftT.win_loss, rightT.win_loss),
    cr_dr: add(leftT.cr_dr, rightT.cr_dr),
    balance: add(leftT.balance, rightT.balance),
  };
}

/**
 * Apply saved API/global/local order to currency rows from get_company_currencies_api.
 */
export function orderCurrencyRows(orderedData, orderData) {
  let ordered = [...orderedData];
  try {
    let saved = null;
    if (orderData && orderData.success && Array.isArray(orderData.data?.order) && orderData.data.order.length > 0) {
      saved = JSON.stringify(orderData.data.order);
    }
    if (!saved) return ordered;

    const order = JSON.parse(saved);
    if (!Array.isArray(order) || order.length === 0) return ordered;

    const normalized = [];
    order.forEach((code) => {
      const upper = String(code || "")
        .trim()
        .toUpperCase();
      if (!upper || upper === "ALL") return;
      if (!normalized.includes(upper)) normalized.push(upper);
    });
    const byCode = new Map(ordered.map((c) => [String(c.code || "").trim().toUpperCase(), c]));
    const out = [];
    normalized.forEach((upper) => {
      if (byCode.has(upper)) {
        out.push(byCode.get(upper));
        byCode.delete(upper);
      }
    });
    byCode.forEach((c) => out.push(c));
    return out;
  } catch {
    return ordered;
  }
}

export function readTransactionCurrencyFilterState(companyId) {
  if (!companyId) return null;
  try {
    const raw = localStorage.getItem(TRANSACTION_CURRENCY_FILTER_KEY_PREFIX + companyId);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o || typeof o !== "object") return null;
    const showAll = !!o.showAll;
    const currencies = Array.isArray(o.currencies) ? o.currencies.map((c) => String(c || "").trim()).filter(Boolean) : [];
    return { showAll, currencies };
  } catch {
    return null;
  }
}

/** Row count after the same client filters as the main grid (for search-complete toasts). */
export function countDisplayedRows(rawSearchData, searchState, txType) {
  if (!rawSearchData) return 0;
  const rawLeft = dedupeRowsByAccountAndCurrency(rawSearchData.left_table || []);
  const rawRight = dedupeRowsByAccountAndCurrency(rawSearchData.right_table || []);
  const pf = applyPaymentWinLossFilters(rawLeft, rawRight, {
    showPaymentOnly: searchState.showPaymentOnly,
    showCaptureOnly: searchState.showCaptureOnly,
  });
  const z = applyZeroBalanceFilter(pf.filteredLeft, pf.filteredRight, searchState.showZeroBalance);
  const norm = normalizeRateRowsByCrDr(z.left, z.right, txType === "RATE");
  return (norm.leftRows?.length || 0) + (norm.rightRows?.length || 0);
}

export function buildTxListSessionKey({
  companyId,
  dateFrom,
  dateTo,
  selectedCategories,
  showInactive,
  showCaptureOnly,
  hideZeroBalance,
  showAllCurrencies,
  selectedCurrencies,
}) {
  if (!dateFrom || !dateTo) return null;
  let cat = "";
  if (selectedCategories.length > 0 && !selectedCategories.includes("")) {
    cat = [...selectedCategories].sort().join(",");
  }
  let cur = "";
  if (!showAllCurrencies && selectedCurrencies.length > 0) {
    cur = [...selectedCurrencies].sort().join(",");
  }
  const cid = companyId != null ? String(companyId) : "";
  const hideZero = hideZeroBalance ? "0" : "1";
  return (
    TX_LIST_SESSION_PREFIX +
    [cid, dateFrom, dateTo, cat, showInactive ? "1" : "0", showCaptureOnly ? "1" : "0", hideZero, cur, showAllCurrencies ? "1" : "0"].join("|")
  );
}
