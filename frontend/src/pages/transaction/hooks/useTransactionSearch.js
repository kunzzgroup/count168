import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { formatDmy } from "../transactionFormat.js";
import {
  TRANSACTION_CURRENCY_FILTER_KEY_PREFIX,
  TX_LIST_INVALIDATE_LS_KEY,
  applyPaymentWinLossFilters,
  applyZeroBalanceFilter,
  buildTxListSessionKey,
  calculateTotals,
  countDisplayedRows,
  mergeTotals,
  normalizeRateRowsByCrDr,
  readTransactionCurrencyFilterState,
  sortByRole,
  dedupeRowsByAccountAndCurrency,
  sanitizeSearchApiData,
} from "../transactionPaymentLogic.js";
import { searchTransactions as searchTransactionsApi, saveUserCurrencyOrder } from "../transactionApi.js";

export function useTransactionSearch({
  filterSnapshot,
  todayDmy,
  pushToast,
  txType,
  currencyRowsOrdered,
  setCurrencyRowsOrdered,
}) {
  const [dateFrom, setDateFrom] = useState(null);
  const [dateTo, setDateTo] = useState(null);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [searchState, setSearchState] = useState({
    showName: false,
    showCaptureOnly: false,
    showPaymentOnly: false,
    showZeroBalance: false,
  });
  const [showAllCurrencies, setShowAllCurrencies] = useState(false);
  const [selectedCurrencies, setSelectedCurrencies] = useState([]);
  const [rawSearchData, setRawSearchData] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [tablesVisible, setTablesVisible] = useState(false);

  const queryClient = useQueryClient();
  const latestRunTokenRef = useRef(0);
  const lastCompletedSearchKeyRef = useRef("");
  const lastCompletedSearchTsRef = useRef(0);
  const categoryChangedByUserRef = useRef(false);
  const initialSearchDoneRef = useRef(false);
  const lastSearchCommitMsRef = useRef(0);
  const runSearchRef = useRef(null);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);

  const categoryAllCheckboxRef = useRef(null);
  const effectiveDateFrom = dateFrom || todayDmy;
  const effectiveDateTo = dateTo || todayDmy;
  const effectiveDateRangeText = `${effectiveDateFrom} - ${effectiveDateTo}`;

  const persistCurrencyFilter = useCallback((companyId, showAll, sel) => {
    if (!companyId) return;
    try {
      localStorage.setItem(
        TRANSACTION_CURRENCY_FILTER_KEY_PREFIX + companyId,
        JSON.stringify({ showAll: !!showAll, currencies: [...(sel || [])] }),
      );
    } catch {
      /* ignore */
    }
  }, []);

  const toggleCategory = useCallback(() => setCategoryOpen((v) => !v), []);
  const toggleQuick = useCallback(() => setQuickOpen((v) => !v), []);

  const onCategoryAllChange = useCallback((checked) => {
    if (!checked) return;
    categoryChangedByUserRef.current = true;
    setSelectedCategories([]);
  }, []);

  const toggleCategoryValue = useCallback((value) => {
    const v = String(value || "").toUpperCase().trim();
    categoryChangedByUserRef.current = true;
    setSelectedCategories((prev) => {
      const set = new Set(prev.map((x) => String(x).toUpperCase()));
      if (set.has(v)) set.delete(v);
      else set.add(v);
      return [...set];
    });
  }, []);

  const removeCategoryTag = useCallback((categoryValue) => {
    const v = String(categoryValue || "").toUpperCase().trim();
    setSelectedCategories((prev) => prev.filter((x) => String(x).toUpperCase() !== v));
    // Trigger search after state update
    categoryChangedByUserRef.current = true;
  }, []);

  const selectQuickRange = useCallback((key) => {
    setQuickOpen(false);
    if (typeof window.selectQuickRange === "function") {
      window.selectQuickRange(key);
      return;
    }

    const now = new Date();
    const start = new Date(now);
    const end = new Date(now);

    const setWeekStart = (d) => {
      const day = d.getDay();
      const diff = day;
      d.setDate(d.getDate() - diff);
    };

    const setWeekEnd = (d) => {
      const day = d.getDay();
      const diff = 6 - day;
      d.setDate(d.getDate() + diff);
    };

    switch (key) {
      case "today":
        break;
      case "yesterday":
        start.setDate(start.getDate() - 1);
        end.setDate(end.getDate() - 1);
        break;
      case "thisWeek":
        setWeekStart(start);
        setWeekEnd(end);
        break;
      case "lastWeek": {
        setWeekStart(start);
        setWeekEnd(end);
        start.setDate(start.getDate() - 7);
        end.setDate(end.getDate() - 7);
        break;
      }
      case "thisMonth":
        start.setDate(1);
        end.setMonth(end.getMonth() + 1, 0);
        break;
      case "lastMonth":
        start.setMonth(start.getMonth() - 1, 1);
        end.setMonth(end.getMonth(), 0);
        break;
      case "thisYear":
        start.setMonth(0, 1);
        end.setMonth(11, 31);
        break;
      case "lastYear":
        start.setFullYear(start.getFullYear() - 1, 0, 1);
        end.setFullYear(end.getFullYear() - 1, 11, 31);
        break;
      default:
        break;
    }

    setDateFrom(formatDmy(start));
    setDateTo(formatDmy(end));
    queueMicrotask(() => {
      runSearchRef.current?.({ silent: false });
    });
  }, [formatDmy, setDateFrom, setDateTo]);

  const toggleAllCurrenciesBtn = useCallback(() => {
    const next = !showAllCurrencies;
    setShowAllCurrencies(next);
    const nextSel = [];
    setSelectedCurrencies(nextSel);
    persistCurrencyFilter(filterSnapshot?.companyId, next, nextSel);
  }, [showAllCurrencies, filterSnapshot?.companyId, persistCurrencyFilter]);

  const toggleCurrencyBtn = useCallback(
    (code) => {
      const nextShowAll = false;
      let nextSel = [];
      const c = String(code || "").toUpperCase().trim();
      if (!c) return;

      const set = new Set(selectedCurrencies.map((x) => String(x || "").toUpperCase().trim()));
      if (set.has(c)) {
        set.delete(c);
      } else {
        set.add(c);
      }
      nextSel = [...set];

      setShowAllCurrencies(nextShowAll);
      setSelectedCurrencies(nextSel);
      persistCurrencyFilter(filterSnapshot?.companyId, nextShowAll, nextSel);
    },
    [selectedCurrencies, filterSnapshot?.companyId, persistCurrencyFilter],
  );

  const onCurrencyDragStart = useCallback((code) => {
    window.__dragging_currency_code = code;
  }, []);

  const onCurrencyDropOn = useCallback(
    async (targetCode) => {
      const sourceCode = window.__dragging_currency_code;
      delete window.__dragging_currency_code;
      if (!sourceCode || sourceCode === targetCode) return;

      const list = [...currencyRowsOrdered];
      const sIdx = list.findIndex((x) => x.code === sourceCode);
      const tIdx = list.findIndex((x) => x.code === targetCode);
      if (sIdx === -1 || tIdx === -1) return;

      const [moved] = list.splice(sIdx, 1);
      list.splice(tIdx, 0, moved);

      setCurrencyRowsOrdered(list);
      await saveUserCurrencyOrder(list.map((x) => x.code));
    },
    [currencyRowsOrdered, setCurrencyRowsOrdered],
  );

  useEffect(() => {
    if (!quickOpen) return;
    const close = (e) => {
      if (e.target.closest?.(".quick-select-dropdown-toggle")) return;
      setQuickOpen(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [quickOpen]);

  useEffect(() => {
    if (!categoryOpen) return;
    const close = (e) => {
      if (e.target.closest?.(".category-dropdown")) return;
      setCategoryOpen(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [categoryOpen]);

  useEffect(() => {
    if (!categoryChangedByUserRef.current) return;
    categoryChangedByUserRef.current = false;
    if (!filterSnapshot?.companyId) return;
    if (!effectiveDateFrom || !effectiveDateTo) return;
    if (!showAllCurrencies && selectedCurrencies.length === 0) return;
    void runSearchRef.current?.({ silent: false });
  }, [
    selectedCategories,
    filterSnapshot?.companyId,
    effectiveDateFrom,
    effectiveDateTo,
    effectiveDateRangeText,
    showAllCurrencies,
    selectedCurrencies,
  ]);

  useEffect(() => {
    const skipFilterSearchEffect = { current: true };
    // This effect handles changes in searchState
  }, []);

  const skipFilterSearchEffectRef = useRef(true);
  useEffect(() => {
    if (skipFilterSearchEffectRef.current) {
      skipFilterSearchEffectRef.current = false;
      return;
    }
    if (!filterSnapshot?.companyId) return;
    if (!effectiveDateFrom || !effectiveDateTo) return;
    void runSearchRef.current?.({ silent: false });
  }, [searchState.showCaptureOnly, searchState.showPaymentOnly, searchState.showZeroBalance, filterSnapshot?.companyId, effectiveDateFrom, effectiveDateTo]);

  const saveTxListToSession = useCallback(
    (data) => {
      try {
        const key = buildTxListSessionKey({
          companyId: filterSnapshot?.companyId,
          dateFrom: effectiveDateFrom,
          dateTo: effectiveDateTo,
          selectedCategories,
          showInactive: searchState.showPaymentOnly,
          showCaptureOnly: searchState.showCaptureOnly,
          hideZeroBalance: !searchState.showZeroBalance,
          showAllCurrencies,
          selectedCurrencies,
        });
        if (!key || !data) return;
        const ts = Date.now();
        const wrap = JSON.stringify({ v: 2, savedAt: ts, data });
        if (wrap.length > 1800000) return;
        sessionStorage.setItem(key, wrap);
        lastSearchCommitMsRef.current = ts;
      } catch {
        /* quota */
      }
    },
    [
      filterSnapshot?.companyId,
      effectiveDateFrom,
      effectiveDateTo,
      selectedCategories,
      searchState.showPaymentOnly,
      searchState.showCaptureOnly,
      searchState.showZeroBalance,
      showAllCurrencies,
      selectedCurrencies,
    ],
  );

  const runSearch = useCallback(async ({ silent = false, isInitialLoad = false } = {}) => {
    const cid = filterSnapshot?.companyId;
    if (!cid) return;
    if (!effectiveDateFrom || !effectiveDateTo) {
      pushToast("Please select date range", "error");
      return;
    }
    if (!showAllCurrencies && selectedCurrencies.length === 0) {
      setTablesVisible(false);
      pushToast("Please select at least one Currency or select All", "info");
      return;
    }

    const categoryParam =
      selectedCategories.length > 0 && !selectedCategories.includes("")
        ? [...selectedCategories].sort().join(",")
        : "";
    const singleSelectedCurrency =
      !showAllCurrencies && selectedCurrencies.length === 1 ? String(selectedCurrencies[0] || "").toUpperCase() : "";

    const requestKey = JSON.stringify({
      dateFrom: effectiveDateFrom,
      dateTo: effectiveDateTo,
      categoryParam,
      showInactive: searchState.showPaymentOnly ? "1" : "0",
      showCaptureOnly: searchState.showCaptureOnly ? "1" : "0",
      hideZero: searchState.showZeroBalance ? "0" : "1",
      companyId: cid || "",
      showAllCurrencies: !!showAllCurrencies,
      currencies: [...selectedCurrencies].sort().join(","),
    });

    if (!silent && !isInitialLoad && lastCompletedSearchKeyRef.current === requestKey && Date.now() - lastCompletedSearchTsRef.current < 1200) {
      return;
    }

    const runToken = ++latestRunTokenRef.current;
    await queryClient.cancelQueries({ queryKey: ["tx-search"] });

    if (!silent) setSearchLoading(true);
    setTablesVisible(true);

    const paramsBase = {
      companyId: cid,
      dateFrom: effectiveDateFrom,
      dateTo: effectiveDateTo,
      showInactive: searchState.showPaymentOnly,
      showCaptureOnly: searchState.showCaptureOnly,
      hideZeroBalance: !searchState.showZeroBalance,
      categories: selectedCategories.length > 0 ? selectedCategories : undefined,
      currencyCodes: !showAllCurrencies && selectedCurrencies.length > 0 ? selectedCurrencies : undefined,
    };

    const fetchSearch = (params) =>
      queryClient.fetchQuery({
        queryKey: [
          "tx-search",
          {
            companyId: params.companyId,
            dateFrom: params.dateFrom,
            dateTo: params.dateTo,
            showInactive: !!params.showInactive,
            showCaptureOnly: !!params.showCaptureOnly,
            hideZeroBalance: !!params.hideZeroBalance,
            categories: Array.isArray(params.categories) ? [...params.categories].sort() : [],
            currencyCodes: Array.isArray(params.currencyCodes) ? [...params.currencyCodes].sort() : [],
          },
        ],
        queryFn: ({ signal }) => searchTransactionsApi({ ...params, signal }),
        staleTime: 15_000,
        gcTime: 2 * 60_000,
      });

    const commitQuiet = (data) => {
      const cleaned = sanitizeSearchApiData(data);
      setRawSearchData(cleaned);
      saveTxListToSession(cleaned);
      lastCompletedSearchKeyRef.current = requestKey;
      lastCompletedSearchTsRef.current = Date.now();
      const totalAccounts = (cleaned.left_table?.length || 0) + (cleaned.right_table?.length || 0);
      const displayed = countDisplayedRows(cleaned, searchState, txType);
      if (!silent) {
        if (totalAccounts === 0) {
          pushToast(
            "Search completed but no data found. Please check date range, Currency filter, or confirm data has been submitted",
            "info",
          );
        } else if (displayed === 0 && totalAccounts > 0) {
          pushToast(
            `Search returned ${totalAccounts} row(s), but none match current display filters (e.g. zero balance hidden when "Show 0 balance" is off, or "Show Payment Only" / "Show Win/Loss Only"). Enable "Show 0 balance" or adjust filters.`,
            "info",
          );
        } else {
          pushToast(`Search completed, found ${displayed} record(s)`, "success");
        }
      }
    };

    try {
      const result = await fetchSearch(paramsBase);
      if (latestRunTokenRef.current !== runToken) return;
      if (!result?.success || !result?.data) {
        if (!silent) {
          setRawSearchData(null);
          pushToast(result?.message || result?.error || "Search failed", "error");
        }
        return;
      }

      let currentData = result.data;
      const leftRows = Array.isArray(currentData.left_table) ? currentData.left_table : [];
      const rightRows = Array.isArray(currentData.right_table) ? currentData.right_table : [];
      const totalAccounts = leftRows.length + rightRows.length;

      if (singleSelectedCurrency && totalAccounts === 0) {
        const fallback = await fetchSearch({
          ...paramsBase,
          currencyCodes: undefined,
        });
        if (latestRunTokenRef.current !== runToken) return;
        if (fallback?.success && fallback?.data) {
          const fbLeft = (fallback.data.left_table || []).filter(
            (row) => String(row?.currency || "").toUpperCase() === singleSelectedCurrency,
          );
          const fbRight = (fallback.data.right_table || []).filter(
            (row) => String(row?.currency || "").toUpperCase() === singleSelectedCurrency,
          );
          currentData = {
            ...fallback.data,
            left_table: fbLeft,
            right_table: fbRight,
            totals: {
              left: calculateTotals(fbLeft),
              right: calculateTotals(fbRight),
              summary: mergeTotals(calculateTotals(fbLeft), calculateTotals(fbRight)),
            },
          };
        }
      } else if (searchState.showCaptureOnly && totalAccounts === 0) {
        const fallback = await fetchSearch({
          ...paramsBase,
          showCaptureOnly: false,
        });
        if (latestRunTokenRef.current !== runToken) return;
        if (fallback?.success && fallback?.data?.totals) {
          currentData = {
            ...currentData,
            totals: fallback.data.totals,
          };
        }
      }

      if (latestRunTokenRef.current !== runToken) return;
      commitQuiet(currentData);
    } catch (e) {
      if (e?.name === "AbortError" || e?.name === "CanceledError") return;
      console.error(e);
      if (!silent) pushToast(`Search failed: ${e.message}`, "error");
    } finally {
      if (!silent) setSearchLoading(false);
    }
  }, [
    filterSnapshot?.companyId,
    effectiveDateFrom,
    effectiveDateTo,
    showAllCurrencies,
    selectedCurrencies,
    selectedCategories,
    searchState,
    pushToast,
    saveTxListToSession,
    queryClient,
    txType,
  ]);
  runSearchRef.current = runSearch;

  useEffect(() => {
    return () => {
      queryClient.cancelQueries({ queryKey: ["tx-search"] });
    };
  }, [queryClient]);

  const tablePresentation = useMemo(() => {
    if (!rawSearchData) {
      return {
        mode: "none",
        defaultLeft: [],
        defaultRight: [],
        totalsLeft: calculateTotals([]),
        totalsRight: calculateTotals([]),
        totalsSummary: mergeTotals(calculateTotals([]), calculateTotals([])),
        grouped: [],
        singleCurrencyTitle: null,
      };
    }
    const rawLeft = dedupeRowsByAccountAndCurrency(rawSearchData.left_table || []);
    const rawRight = dedupeRowsByAccountAndCurrency(rawSearchData.right_table || []);
    const pf = applyPaymentWinLossFilters(rawLeft, rawRight, {
      showPaymentOnly: searchState.showPaymentOnly,
      showCaptureOnly: searchState.showCaptureOnly,
    });
    const z = applyZeroBalanceFilter(pf.filteredLeft, pf.filteredRight, searchState.showZeroBalance);
    const norm = normalizeRateRowsByCrDr(z.left, z.right, txType === "RATE");
    let sortedLeft = sortByRole(norm.leftRows);
    let sortedRight = sortByRole(norm.rightRows);
    const totalsLeft = calculateTotals(sortedLeft);
    const totalsRight = calculateTotals(sortedRight);
    const totalsSummary = mergeTotals(totalsLeft, totalsRight);

    const multi = showAllCurrencies || selectedCurrencies.length > 1;
    const codesOrdered = currencyRowsOrdered.map((c) => String(c.code || "").toUpperCase().trim()).filter(Boolean);

    if (!multi) {
      const title =
        selectedCurrencies.length === 1 ? `Currency: ${selectedCurrencies[0]}` : null;
      return {
        mode: "default",
        defaultLeft: sortedLeft,
        defaultRight: sortedRight,
        totalsLeft,
        totalsRight,
        totalsSummary,
        grouped: [],
        singleCurrencyTitle: title,
      };
    }

    const groupedMap = {};
    const pushRow = (row, side) => {
      const cur = row.currency || "UNKNOWN";
      if (!groupedMap[cur]) groupedMap[cur] = { left: [], right: [] };
      groupedMap[cur][side].push(row);
    };
    sortedLeft.forEach((row) => pushRow(row, "left"));
    sortedRight.forEach((row) => pushRow(row, "right"));

    let orderedCurrs = [];
    codesOrdered.forEach((code) => {
      if (groupedMap[code]) orderedCurrs.push(code);
    });
    Object.keys(groupedMap).forEach((code) => {
      if (!orderedCurrs.includes(code)) orderedCurrs.push(code);
    });

    const activeCodes = rawSearchData.active_currency_codes;
    if (searchState.showZeroBalance && Array.isArray(activeCodes) && activeCodes.length > 0) {
      const activeSet = new Set(activeCodes.map((c) => String(c || "").toUpperCase()));
      orderedCurrs = orderedCurrs.filter((code) => activeSet.has(String(code || "").toUpperCase()));
    }

    const grouped = orderedCurrs.map((currency) => {
      const { left: gl, right: gr } = groupedMap[currency];
      const l = sortByRole(gl);
      const r = sortByRole(gr);
      const tL = calculateTotals(l);
      const tR = calculateTotals(r);
      const tS = mergeTotals(tL, tR);
      return { currency, left: l, right: r, totalsLeft: tL, totalsRight: tR, totalsSummary: tS };
    });

    if (grouped.length === 0 && (sortedLeft.length > 0 || sortedRight.length > 0)) {
      const title =
        selectedCurrencies.length === 1 ? `Currency: ${selectedCurrencies[0]}` : null;
      return {
        mode: "default",
        defaultLeft: sortedLeft,
        defaultRight: sortedRight,
        totalsLeft,
        totalsRight,
        totalsSummary,
        grouped: [],
        singleCurrencyTitle: title,
      };
    }

    return {
      mode: "grouped",
      defaultLeft: [],
      defaultRight: [],
      totalsLeft,
      totalsRight,
      totalsSummary,
      grouped,
      singleCurrencyTitle: null,
    };
  }, [rawSearchData, searchState, txType, showAllCurrencies, selectedCurrencies, currencyRowsOrdered]);

  /** 切换公司：立刻清空结果并中止旧请求，避免短暂叠显上一间公司的数据（如多条 CAPITAL / XE）。 */
  useEffect(() => {
    const cid = filterSnapshot?.companyId;
    if (cid == null) return;
    setRawSearchData(null);
    setTablesVisible(false);
    lastCompletedSearchKeyRef.current = "";
    try {
      latestRunTokenRef.current += 1;
      queryClient.cancelQueries({ queryKey: ["tx-search"] });
    } catch {
      /* ignore */
    }
  }, [filterSnapshot?.companyId, queryClient]);

  // Initial search / replay logic
  useEffect(() => {
    if (filterSnapshot?.companyId) {
      initialSearchDoneRef.current = false;
    }
  }, [filterSnapshot?.companyId]);

  useEffect(() => {
    if (!filterSnapshot?.companyId) return;
    if (currencyRowsOrdered.length === 0) return;
    if (!showAllCurrencies && selectedCurrencies.length === 0) return;
    if (initialSearchDoneRef.current) return;

    let hadReplay = false;
    try {
      const key = buildTxListSessionKey({
        companyId: filterSnapshot?.companyId,
        dateFrom: effectiveDateFrom,
        dateTo: effectiveDateTo,
        selectedCategories,
        showInactive: searchState.showPaymentOnly,
        showCaptureOnly: searchState.showCaptureOnly,
        hideZeroBalance: !searchState.showZeroBalance,
        showAllCurrencies,
        selectedCurrencies,
      });
      if (key) {
        const raw = sessionStorage.getItem(key);
        if (raw) {
          const o = JSON.parse(raw);
          if (o?.data && (o.v === 1 || o.v === 2)) {
            const invalidateTs = parseInt(localStorage.getItem(TX_LIST_INVALIDATE_LS_KEY) || "0", 10) || 0;
            const savedAt = o.v === 2 && typeof o.savedAt === "number" ? o.savedAt : 0;
            if (invalidateTs <= savedAt) {
              setRawSearchData(sanitizeSearchApiData(o.data));
              setTablesVisible(true);
              lastSearchCommitMsRef.current = savedAt || Date.now();
              hadReplay = true;
            } else {
              try {
                sessionStorage.removeItem(key);
              } catch {
                /* ignore */
              }
            }
          }
        }
      }
    } catch {
      /* ignore */
    }

    initialSearchDoneRef.current = true;
    void runSearch({ isInitialLoad: true, silent: hadReplay });
  }, [
    filterSnapshot?.companyId,
    currencyRowsOrdered.length,
    showAllCurrencies,
    selectedCurrencies,
    effectiveDateFrom,
    effectiveDateTo,
    effectiveDateRangeText,
    selectedCategories,
    searchState,
    runSearch,
  ]);

  return {
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    effectiveDateFrom,
    effectiveDateTo,
    effectiveDateRangeText,
    selectedCategories,
    setSelectedCategories,
    searchState,
    setSearchState,
    showAllCurrencies,
    setShowAllCurrencies,
    selectedCurrencies,
    setSelectedCurrencies,
    rawSearchData,
    setRawSearchData,
    searchLoading,
    setSearchLoading,
    tablesVisible,
    setTablesVisible,
    runSearch,
    persistCurrencyFilter,
    initialSearchDoneRef,
    lastSearchCommitMsRef,
    categoryChangedByUserRef,
    tablePresentation,
    categoryOpen,
    setCategoryOpen,
    quickOpen,
    setQuickOpen,
    categoryAllCheckboxRef,
    toggleCategory,
    toggleQuick,
    onCategoryAllChange,
    toggleCategoryValue,
    removeCategoryTag,
    selectQuickRange,
    toggleAllCurrenciesBtn,
    onCurrencyDragStart,
    onCurrencyDropOn,
    toggleCurrencyBtn,
  };
}

