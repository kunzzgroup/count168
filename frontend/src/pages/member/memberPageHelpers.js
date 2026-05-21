import { MoneyDecimal } from "../../utils/moneyDecimal.js";

export const MINI_GRID_SHELL_CCY = ["MYR", "SGD"];
export const MINI_GRID_SHELL_ROWS = 5;

/** Win/Loss 迷你矩阵：账户行数大于此值时，矩阵区域纵向滚动，默认可见约 5 个账户行 + 表头 */
export const WINLOSS_MINI_MATRIX_ACCOUNT_SCROLL_THRESHOLD = 5;

/** Win/Loss Currency：每条 segment 白底带最多按钮数（含第一段的「All」占位），多出的自动再开新带 */
export const WINLOSS_CURRENCY_SEGMENT_MAX_BUTTONS = 7;

/** Win/Loss 矩阵：<10 列 1fr 铺满；≥10 列时每列宽 = 9 列铺满时的单列宽，向右延伸并可横向滚动 */
export const WINLOSS_MATRIX_SCROLL_CCY_THRESHOLD = 10;
/** 视口内按此列数均分宽度（与 <10 列时 9 列铺满的间距一致） */
export const WINLOSS_MATRIX_FILL_CCY_COLS = 9;
export const WINLOSS_MATRIX_ROWHEAD_COL_WIDTH = "5.75rem";

export function normalizeNumber(value) {
  try {
    return MoneyDecimal.toDecimal(value || "0", 0);
  } catch {
    return MoneyDecimal.toDecimal("0", 0);
  }
}

export function formatPaymentHistoryMoney(value) {
  if (value === "-" || value === null || value === undefined) return "-";
  const cleaned = String(value).replace(/,/g, "").trim();
  if (cleaned === "" || cleaned === "-") return "0.00";
  const exact2 = cleaned.match(/^(-?)(\d+)\.(\d{2})$/);
  if (exact2) {
    const neg = exact2[1] === "-" ? "-" : "";
    const intWithSep = exact2[2].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return `${neg}${intWithSep}.${exact2[3]}`;
  }
  return MoneyDecimal.formatThousands(cleaned, 2);
}

export function memberHistoryClosingBalancesForAllCurrencies(rows, wantedUpperSet) {
  const map = new Map();
  wantedUpperSet.forEach((cu) => map.set(cu, normalizeNumber("0")));
  (rows || []).forEach((row) => {
    const rc = String(row.currency || "")
      .trim()
      .toUpperCase();
    if (!wantedUpperSet.has(rc)) return;
    if (row.balance !== "-" && row.balance !== null && row.balance !== undefined && String(row.balance).trim() !== "") {
      map.set(rc, normalizeNumber(row.balance));
    }
  });
  return map;
}

export function wlGridStorageKey(companyId, loginRootId) {
  return `member_wl_grid:${companyId}:${loginRootId}`;
}

export function applyDefaultWLGridSelection(linkedIds, companyId, loginRootId) {
  const ids = linkedIds.map((id) => Number(id)).filter((id) => id > 0);
  if (!ids.length) return [];
  try {
    const raw = sessionStorage.getItem(wlGridStorageKey(companyId, loginRootId));
    if (raw) {
      const arr = JSON.parse(raw);
      const selected = arr.map(Number).filter((id) => ids.includes(id));
      if (selected.length) return selected;
    }
  } catch {
    // ignore
  }
  return [...ids];
}

export function saveWLGridSelection(ids, companyId, loginRootId) {
  try {
    sessionStorage.setItem(wlGridStorageKey(companyId, loginRootId), JSON.stringify(ids));
  } catch {
    // ignore
  }
}

export function getWlGridIncludedAccountIds(linkedAccounts, wlGridSelectedIds) {
  const allow = new Set(linkedAccounts.map((a) => Number(a.id)).filter(Boolean));
  let sel = wlGridSelectedIds.map(Number).filter((id) => allow.has(id));
  if (!sel.length) sel = [...allow];
  return sel;
}

export function collectLinkedUnionCurrencyCodes(linkedAccountCurrenciesMap, includedIds) {
  const codes = new Set();
  includedIds.forEach((id) => {
    const set = linkedAccountCurrenciesMap.get(Number(id));
    if (set?.size) {
      set.forEach((c) => {
        if (c) codes.add(String(c).trim().toUpperCase());
      });
    }
  });
  return [...codes];
}

export function accountHoldsMiniGridCurrency(linkedAccountCurrenciesMap, linkedCurrenciesLoaded, accountId, currencyUpper) {
  const cu = String(currencyUpper || "")
    .trim()
    .toUpperCase();
  if (!cu) return true;
  if (!linkedCurrenciesLoaded) return true;
  const set = linkedAccountCurrenciesMap.get(Number(accountId));
  if (!set || set.size === 0) return true;
  return set.has(cu);
}

export function getOrderedMiniGridAccounts(linkedAccounts, wlGridSelectedIds, currenciesUpper, linkedAccountCurrenciesMap, linkedCurrenciesLoaded) {
  const allowIds = new Set(linkedAccounts.map((a) => Number(a.id)));
  const sel = new Set(wlGridSelectedIds.map(Number).filter((id) => allowIds.has(id)));
  if (!sel.size) allowIds.forEach((id) => sel.add(id));
  const uppers = (currenciesUpper || []).map((c) => String(c || "").trim().toUpperCase()).filter(Boolean);
  return linkedAccounts.filter((a) => {
    if (!sel.has(Number(a.id))) return false;
    return uppers.some((cu) => accountHoldsMiniGridCurrency(linkedAccountCurrenciesMap, linkedCurrenciesLoaded, a.id, cu));
  });
}

export function getAvailableCurrenciesFromSummaryOnly(currencySummary, currencySortOrder, currencyDisplayOrder) {
  const codes = [];
  currencySummary.forEach((row) => {
    const code = String(row.currency || "").trim();
    if (!code) return;
    if (!currencySortOrder[code]) {
      const sortValue =
        typeof row.currency_id === "number" ? row.currency_id : parseInt(row.currency_id || "0", 10) || Number.MAX_SAFE_INTEGER;
      currencySortOrder[code] = sortValue;
    }
    codes.push(code);
  });
  const unique = [...new Set(codes)];
  return sortCurrencyList(unique, currencySortOrder, currencyDisplayOrder, false);
}

export function sortCurrencyList(baseOrder, currencySortOrder, currencyDisplayOrder, fromLinkedUnion) {
  if (!baseOrder.length) return [];
  if (currencyDisplayOrder?.length) {
    const orderSet = new Set(currencyDisplayOrder);
    const inOrder = [];
    currencyDisplayOrder.forEach((c) => {
      if (baseOrder.includes(c)) inOrder.push(c);
    });
    const notInOrder = baseOrder.filter((c) => !orderSet.has(c));
    notInOrder.sort((a, b) => compareCurrencySort(a, b, currencySortOrder, fromLinkedUnion));
    return [...inOrder, ...notInOrder];
  }
  return [...baseOrder].sort((a, b) => compareCurrencySort(a, b, currencySortOrder, fromLinkedUnion));
}

function compareCurrencySort(a, b, currencySortOrder, fromLinkedUnion) {
  const orderA = currencySortOrder[a] ?? Number.MAX_SAFE_INTEGER;
  const orderB = currencySortOrder[b] ?? Number.MAX_SAFE_INTEGER;
  if (orderA !== orderB) return orderA - orderB;
  if (!fromLinkedUnion) return a.localeCompare(b);
  return a.localeCompare(b);
}

export function getAvailableCurrencies({
  linkedCurrenciesLoaded,
  linkedAccountCurrenciesMap,
  wlGridSelectedIds,
  linkedAccounts,
  ownedCurrencies,
  currencySummary,
  currencySortOrder,
  currencyDisplayOrder,
}) {
  let baseOrder = [];
  let fromLinkedUnion = false;
  if (linkedCurrenciesLoaded) {
    const included = getWlGridIncludedAccountIds(linkedAccounts, wlGridSelectedIds);
    const u = [...new Set(collectLinkedUnionCurrencyCodes(linkedAccountCurrenciesMap, included).map((x) => x.trim().toUpperCase()).filter(Boolean))];
    if (u.length) {
      baseOrder = u;
      fromLinkedUnion = true;
    }
  }
  if (!fromLinkedUnion) {
    const seen = new Set();
    ownedCurrencies.forEach((o) => {
      const c = String(o.code || "")
        .trim()
        .toUpperCase();
      if (!c || seen.has(c)) return;
      seen.add(c);
      baseOrder.push(c);
    });
  }
  if (!baseOrder.length) {
    return getAvailableCurrenciesFromSummaryOnly(currencySummary, currencySortOrder, currencyDisplayOrder);
  }
  return sortCurrencyList(baseOrder, currencySortOrder, currencyDisplayOrder, fromLinkedUnion);
}

export function getMemberMiniGridCurrencies(availableCurrencies, isAllSelected, selectedCurrencies) {
  if (!availableCurrencies.length) return [];
  if (isAllSelected) return [...availableCurrencies];
  return availableCurrencies.filter((code) => selectedCurrencies.includes(code));
}

/** 切换币种按钮：至少保留一项（无选中时回退为 All）。 */
export function applyCurrencyToggle(available, isAllSelected, selectedCurrencies, code) {
  if (!available?.length) {
    return { isAllSelected: true, selectedCurrencies: [] };
  }
  if (isAllSelected) {
    return { isAllSelected: false, selectedCurrencies: [code] };
  }
  if (selectedCurrencies.includes(code)) {
    const next = selectedCurrencies.filter((c) => c !== code);
    if (next.length === 0) {
      return { isAllSelected: true, selectedCurrencies: [] };
    }
    return { isAllSelected: false, selectedCurrencies: next };
  }
  return { isAllSelected: false, selectedCurrencies: [...selectedCurrencies, code] };
}

export function sanitizeCurrencySelection(available, isAllSelected, selectedCurrencies, linkedCurrenciesLoaded, linkedAccountCurrenciesMap, wlGridSelectedIds, linkedAccounts) {
  const availSet = new Set(available);
  const retained = selectedCurrencies.filter((c) => availSet.has(c));
  if (!available.length) {
    return { isAllSelected: true, selectedCurrencies: [] };
  }
  if (isAllSelected) {
    return { isAllSelected: true, selectedCurrencies: [] };
  }
  if (retained.length === 0) {
    return { isAllSelected: true, selectedCurrencies: [] };
  }
  return { isAllSelected: false, selectedCurrencies: retained };
}

export function computeTableTotals(rows) {
  let totalWinLoss = normalizeNumber("0");
  let totalCrDr = normalizeNumber("0");
  let closingBalance = normalizeNumber("0");
  (rows || []).forEach((row) => {
    totalWinLoss = totalWinLoss.plus(normalizeNumber(row.win_loss));
    totalCrDr = totalCrDr.plus(normalizeNumber(row.cr_dr));
    if (row.balance !== "-" && row.balance !== null && row.balance !== undefined && String(row.balance).trim() !== "") {
      closingBalance = normalizeNumber(row.balance);
    }
  });
  return { totalWinLoss, totalCrDr, closingBalance };
}

export function groupHistoryForDisplay(historyRows, isAllSelected, selectedCurrencies, availableCurrencies) {
  const map = new Map();
  const rows = Array.isArray(historyRows) ? historyRows : [];
  for (const row of rows) {
    const c = String(row.currency || "-").trim() || "-";
    if (!map.has(c)) map.set(c, []);
    map.get(c).push(row);
  }
  if (isAllSelected) {
    const order = availableCurrencies.length > 0 ? availableCurrencies : Array.from(map.keys());
    return order.map((c) => [c, map.get(c) || []]);
  }
  if (!selectedCurrencies.length) return [];
  return selectedCurrencies.map((c) => [c, map.get(c) || []]);
}

export function miniMatrixGridTemplateColumns(ncu) {
  const rowHead = `minmax(${WINLOSS_MATRIX_ROWHEAD_COL_WIDTH}, max-content)`;
  if (ncu <= 0) return rowHead;
  /* 单币种紧凑表单独组件，此处仅多币种矩阵 */
  if (ncu === 1) {
    return `${rowHead} minmax(4.25rem, max-content)`;
  }
  if (ncu < WINLOSS_MATRIX_SCROLL_CCY_THRESHOLD) {
    return `${rowHead} repeat(${ncu}, minmax(0, 1fr))`;
  }
  /* ≥10 列：列宽由滚动容器 JS 写入 --member-wl-ccy-fill-col-w（px），禁止 minmax(0,*) 压缩 */
  return `${rowHead} repeat(${ncu}, var(--member-wl-ccy-fill-col-w))`;
}
