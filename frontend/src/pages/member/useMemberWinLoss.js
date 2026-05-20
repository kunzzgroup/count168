import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildApiUrl } from "../../utils/apiUrl.js";
import { MoneyDecimal } from "../../utils/moneyDecimal.js";
import {
  MINI_GRID_SHELL_CCY,
  accountHoldsMiniGridCurrency,
  applyDefaultWLGridSelection,
  formatPaymentHistoryMoney,
  getAvailableCurrencies,
  getMemberMiniGridCurrencies,
  getOrderedMiniGridAccounts,
  groupHistoryForDisplay,
  memberHistoryClosingBalancesForAllCurrencies,
  normalizeNumber,
  saveWLGridSelection,
  sanitizeCurrencySelection,
} from "./memberPageHelpers.js";

function parseJsonResponse(text) {
  const raw = String(text || "").trim();
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    if (start === -1) throw new Error("Invalid JSON response");
    let depth = 0;
    let inString = false;
    let escaped = false;
    let quote = "";
    let end = -1;
    for (let i = start; i < raw.length; i += 1) {
      const ch = raw[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (inString) {
        if (ch === "\\") escaped = true;
        else if (ch === quote) inString = false;
        continue;
      }
      if (ch === '"' || ch === "'") {
        inString = true;
        quote = ch;
        continue;
      }
      if (ch === "{") depth += 1;
      if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end === -1) throw new Error("Invalid JSON response");
    return JSON.parse(raw.slice(start, end + 1));
  }
}

function mapBatchCurrencies(data, currencySortOrderRef) {
  const map = new Map();
  (data || []).forEach((row) => {
    const id = Number(row.account_id);
    if (!id) return;
    const set = new Set();
    (row.currencies || []).forEach((c) => {
      const code = String(c.currency_code || c.code || "")
        .trim()
        .toUpperCase();
      if (code) {
        set.add(code);
        const cid = c.currency_id != null ? Number(c.currency_id) : null;
        if (cid && !currencySortOrderRef.current[code]) {
          currencySortOrderRef.current[code] = cid;
        }
      }
    });
    map.set(id, set);
  });
  return map;
}

export function useMemberWinLoss({ showNotification }) {
  const [loginRootAccountId, setLoginRootAccountId] = useState(0);
  const [viewAccountId, setViewAccountId] = useState(0);
  const [companyId, setCompanyId] = useState(0);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [linkedAccounts, setLinkedAccounts] = useState([]);
  const [wlGridSelectedIds, setWlGridSelectedIds] = useState([]);
  const [linkedAccountCurrenciesMap, setLinkedAccountCurrenciesMap] = useState(() => new Map());
  const [linkedCurrenciesLoaded, setLinkedCurrenciesLoaded] = useState(false);
  const [ownedCurrencies, setOwnedCurrencies] = useState([]);
  const [currencySummary, setCurrencySummary] = useState([]);
  const [currencyOrder, setCurrencyOrder] = useState([]);
  const [isAllSelected, setIsAllSelected] = useState(true);
  const [selectedCurrencies, setSelectedCurrencies] = useState([]);
  const [historyRows, setHistoryRows] = useState([]);
  const [loadingTable, setLoadingTable] = useState(false);
  const [linkedDataReady, setLinkedDataReady] = useState(false);
  const [miniGridShell, setMiniGridShell] = useState(true);
  const [miniGridBalances, setMiniGridBalances] = useState(() => new Map());
  const [miniGridTotals, setMiniGridTotals] = useState(() => new Map());
  const [miniGridHint, setMiniGridHint] = useState("");
  const [showLinkedFilterModal, setShowLinkedFilterModal] = useState(false);

  const currencySortOrderRef = useRef({});
  const summaryAbortRef = useRef(null);
  const historyAbortRef = useRef(null);
  const gridAbortRef = useRef(null);
  const searchSeqRef = useRef(0);

  const linkedAccountCurrenciesMapRef = useRef(linkedAccountCurrenciesMap);
  linkedAccountCurrenciesMapRef.current = linkedAccountCurrenciesMap;

  const loadCurrencyOrder = useCallback(async () => {
    try {
      const res = await fetch(buildApiUrl("api/transactions/user_currency_order_api.php"), { credentials: "include" });
      const json = await res.json();
      setCurrencyOrder(Array.isArray(json?.data?.order) ? json.data.order : []);
    } catch {
      setCurrencyOrder([]);
    }
  }, []);

  const loadOwnedCurrencies = useCallback(async (accountId, compId) => {
    if (!accountId || !compId) {
      setOwnedCurrencies([]);
      return;
    }
    try {
      const res = await fetch(
        buildApiUrl(
          `api/accounts/account_currency_api.php?action=get_account_currencies&account_id=${accountId}&company_id=${compId}`,
        ),
        { credentials: "include", cache: "no-store" },
      );
      const json = await parseJsonResponse(await res.text());
      if (!json?.success || !Array.isArray(json.data)) {
        setOwnedCurrencies([]);
        return;
      }
      const list = json.data
        .map((row) => ({
          code: String(row.currency_code || row.code || "")
            .trim()
            .toUpperCase(),
          currency_id: row.currency_id != null ? Number(row.currency_id) : null,
        }))
        .filter((o) => o.code);
      list.forEach((o) => {
        if (o.currency_id && !currencySortOrderRef.current[o.code]) {
          currencySortOrderRef.current[o.code] = o.currency_id;
        }
      });
      setOwnedCurrencies(list);
    } catch {
      setOwnedCurrencies([]);
    }
  }, []);

  const loadLinkedCurrenciesMap = useCallback(async (accounts, compId) => {
    const ids = accounts.map((a) => Number(a.id)).filter(Boolean);
    if (!ids.length || !compId) {
      setLinkedAccountCurrenciesMap(new Map());
      setLinkedCurrenciesLoaded(true);
      return;
    }
    setLinkedCurrenciesLoaded(false);
    try {
      const qs = new URLSearchParams({
        action: "get_batch_account_currencies",
        account_ids: ids.join(","),
        company_id: String(compId),
        _t: String(Date.now()),
      });
      const res = await fetch(buildApiUrl(`api/accounts/account_currency_api.php?${qs}`), {
        credentials: "include",
        cache: "no-store",
      });
      const json = await parseJsonResponse(await res.text());
      if (!json?.success || !Array.isArray(json.data)) {
        setLinkedAccountCurrenciesMap(new Map());
      } else {
        setLinkedAccountCurrenciesMap(mapBatchCurrencies(json.data, currencySortOrderRef));
      }
    } catch {
      setLinkedAccountCurrenciesMap(new Map());
    } finally {
      setLinkedCurrenciesLoaded(true);
    }
  }, []);

  const loadLinkedAccounts = useCallback(
    async (rootId, compId) => {
      if (!rootId || !compId) {
        setLinkedAccounts([]);
        setWlGridSelectedIds([]);
        setLinkedAccountCurrenciesMap(new Map());
        setLinkedCurrenciesLoaded(true);
        setLinkedDataReady(true);
        return;
      }
      try {
        const res = await fetch(
          buildApiUrl(
            `api/accounts/account_link_api.php?action=get_all_linked_accounts&account_id=${rootId}&company_id=${compId}`,
          ),
          { credentials: "include", cache: "no-store" },
        );
        const json = await parseJsonResponse(await res.text());
        const list =
          json?.success && Array.isArray(json.data)
            ? json.data.map((acc) => ({
                id: acc.id,
                account_id: acc.account_id || "",
                name: acc.name || "",
              }))
            : [];
        setLinkedAccounts(list);
        const selected = applyDefaultWLGridSelection(
          list.map((a) => a.id),
          compId,
          rootId,
        );
        setWlGridSelectedIds(selected);
        await loadLinkedCurrenciesMap(list, compId);
      } catch {
        setLinkedAccounts([]);
        setWlGridSelectedIds([]);
        setLinkedAccountCurrenciesMap(new Map());
        setLinkedCurrenciesLoaded(true);
      } finally {
        setLinkedDataReady(true);
      }
    },
    [loadLinkedCurrenciesMap],
  );

  const availableCurrencies = useMemo(
    () =>
      getAvailableCurrencies({
        linkedCurrenciesLoaded,
        linkedAccountCurrenciesMap,
        wlGridSelectedIds,
        linkedAccounts,
        ownedCurrencies,
        currencySummary,
        currencySortOrder: currencySortOrderRef.current,
        currencyDisplayOrder: currencyOrder,
      }),
    [
      linkedCurrenciesLoaded,
      linkedAccountCurrenciesMap,
      wlGridSelectedIds,
      linkedAccounts,
      ownedCurrencies,
      currencySummary,
      currencyOrder,
    ],
  );

  const miniGridCurrencies = useMemo(
    () => getMemberMiniGridCurrencies(availableCurrencies, isAllSelected, selectedCurrencies),
    [availableCurrencies, isAllSelected, selectedCurrencies],
  );

  const showMiniRail = linkedAccounts.length > 0 || viewAccountId > 0;

  const miniGridDisplayCurrencies = useMemo(() => {
    if (miniGridShell) return MINI_GRID_SHELL_CCY;
    if (miniGridCurrencies.length > 0) return miniGridCurrencies;
    if (availableCurrencies.length > 0) {
      return isAllSelected
        ? availableCurrencies
        : availableCurrencies.filter((c) => selectedCurrencies.includes(c));
    }
    return MINI_GRID_SHELL_CCY;
  }, [miniGridShell, miniGridCurrencies, availableCurrencies, isAllSelected, selectedCurrencies]);

  const miniGridAccounts = useMemo(
    () =>
      getOrderedMiniGridAccounts(
        linkedAccounts,
        wlGridSelectedIds,
        miniGridShell ? MINI_GRID_SHELL_CCY : miniGridCurrencies,
        linkedAccountCurrenciesMap,
        linkedCurrenciesLoaded,
      ),
    [
      linkedAccounts,
      wlGridSelectedIds,
      miniGridShell,
      miniGridCurrencies,
      linkedAccountCurrenciesMap,
      linkedCurrenciesLoaded,
    ],
  );

  const groupedRows = useMemo(
    () => groupHistoryForDisplay(historyRows, isAllSelected, selectedCurrencies, availableCurrencies),
    [historyRows, isAllSelected, selectedCurrencies, availableCurrencies],
  );

  const refreshMiniGrid = useCallback(
    async (seq, gridCurrencies, fromDate, toDate, viewId, compId) => {
      if (!linkedAccounts.length || !fromDate || !toDate || !viewId || !compId) {
        setMiniGridBalances(new Map());
        setMiniGridTotals(new Map());
        setMiniGridHint("");
        return;
      }
      const orderUpper = (gridCurrencies || []).map((c) => String(c || "").trim().toUpperCase()).filter(Boolean);
      if (!orderUpper.length) {
        setMiniGridBalances(new Map());
        setMiniGridTotals(new Map());
        setMiniGridHint("");
        return;
      }
      const orderedAccounts = getOrderedMiniGridAccounts(
        linkedAccounts,
        wlGridSelectedIds,
        orderUpper,
        linkedAccountCurrenciesMap,
        linkedCurrenciesLoaded,
      );
      if (linkedCurrenciesLoaded && !orderedAccounts.length) {
        setMiniGridBalances(new Map());
        setMiniGridTotals(new Map());
        setMiniGridHint(
          orderUpper.length > 1
            ? "No accounts in the grid hold any of these currencies."
            : `No accounts in the grid hold ${orderUpper[0]}.`,
        );
        return;
      }
      setMiniGridHint("");
      if (gridAbortRef.current) gridAbortRef.current.abort();
      gridAbortRef.current = new AbortController();
      const signal = gridAbortRef.current.signal;
      try {
        const pairs = await Promise.all(
          orderedAccounts.map(async (acc) => {
            const id = Number(acc.id);
            const params = new URLSearchParams({
              account_id: String(id),
              date_from: fromDate,
              date_to: toDate,
              company_id: String(compId),
            });
            if (orderUpper.length === 1) params.append("currency", orderUpper[0]);
            const res = await fetch(buildApiUrl(`api/transactions/history_api.php?${params}&_t=${Date.now()}`), {
              credentials: "include",
              cache: "no-store",
              signal,
            });
            const json = await parseJsonResponse(await res.text());
            if (!json?.success) throw new Error(json?.error || "Could not load history");
            const wanted = new Set(orderUpper);
            const byCur = memberHistoryClosingBalancesForAllCurrencies(json.data?.history ?? [], wanted);
            return { id, byCurMap: byCur };
          }),
        );
        if (seq !== searchSeqRef.current) return;
        const balanceMap = new Map();
        const totalsByCu = new Map();
        orderUpper.forEach((cu) => totalsByCu.set(cu, normalizeNumber("0")));
        pairs.forEach(({ id, byCurMap }) => {
          if (id <= 0 || !(byCurMap instanceof Map)) return;
          orderUpper.forEach((cu) => {
            const holds = accountHoldsMiniGridCurrency(
              linkedAccountCurrenciesMap,
              linkedCurrenciesLoaded,
              id,
              cu,
            );
            const dec = byCurMap.get(cu);
            if (dec != null && typeof dec.plus === "function") {
              balanceMap.set(`${id}|${cu}`, dec);
              if (holds) totalsByCu.set(cu, totalsByCu.get(cu).plus(dec));
            }
          });
        });
        setMiniGridBalances(balanceMap);
        setMiniGridTotals(totalsByCu);
        setMiniGridShell(false);
      } catch (e) {
        if (e?.name === "AbortError") return;
        if (seq !== searchSeqRef.current) return;
        setMiniGridBalances(new Map());
        setMiniGridTotals(new Map());
        setMiniGridHint(e?.message || "Could not load grid.");
      }
    },
    [linkedAccounts, wlGridSelectedIds, linkedAccountCurrenciesMap, linkedCurrenciesLoaded],
  );

  const fetchMemberHistory = useCallback(
    async (seq = searchSeqRef.current, selectionOverride = null) => {
      if (!viewAccountId || !companyId || !dateFrom || !dateTo) return;
      if (historyAbortRef.current) historyAbortRef.current.abort();
      historyAbortRef.current = new AbortController();
      const signal = historyAbortRef.current.signal;

      const useAll = selectionOverride?.isAllSelected ?? isAllSelected;
      const useSelected = selectionOverride?.selectedCurrencies ?? selectedCurrencies;
      let targetCurrencies = useAll ? availableCurrencies : [...useSelected];
      if (!targetCurrencies.length) {
        if (availableCurrencies.length > 0) {
          setHistoryRows([]);
          setMiniGridBalances(new Map());
          setMiniGridTotals(new Map());
          return;
        }
        const params = new URLSearchParams({
          account_id: String(viewAccountId),
          date_from: dateFrom,
          date_to: dateTo,
          company_id: String(companyId),
        });
        try {
          const res = await fetch(buildApiUrl(`api/transactions/history_api.php?${params}&_t=${Date.now()}`), {
            credentials: "include",
            cache: "no-store",
            signal,
          });
          const json = await parseJsonResponse(await res.text());
          if (seq !== searchSeqRef.current) return;
          if (!json?.success) {
            setHistoryRows([]);
            showNotification(json?.error || "No data in the selected date range.", "info");
            return;
          }
          setHistoryRows(Array.isArray(json.data?.history) ? json.data.history : []);
          showNotification("Query completed", "success");
        } catch (e) {
          if (e?.name === "AbortError") return;
          if (seq !== searchSeqRef.current) return;
          setHistoryRows([]);
          showNotification(e?.message || "No data in the selected date range.", "info");
        }
        const gridCur = getMemberMiniGridCurrencies(availableCurrencies, useAll, useSelected);
        await refreshMiniGrid(seq, gridCur, dateFrom, dateTo, viewAccountId, companyId);
        return;
      }

      const singleRequest = targetCurrencies.length > 1;
      const params = new URLSearchParams({
        account_id: String(viewAccountId),
        date_from: dateFrom,
        date_to: dateTo,
        company_id: String(companyId),
      });
      if (!singleRequest && targetCurrencies[0]) params.append("currency", targetCurrencies[0]);

      try {
        const res = await fetch(buildApiUrl(`api/transactions/history_api.php?${params}&_t=${Date.now()}`), {
          credentials: "include",
          cache: "no-store",
          signal,
        });
        const json = await parseJsonResponse(await res.text());
        if (seq !== searchSeqRef.current) return;
        if (!json?.success) throw new Error(json?.error || "Query failed");
        const history = json.data?.history || [];
        setHistoryRows(history);
        showNotification("Query completed", "success");
      } catch (e) {
        if (e?.name === "AbortError") return;
        if (seq !== searchSeqRef.current) return;
        setHistoryRows([]);
        showNotification(e?.message || "Query failed", "error");
      }
      const gridCur = getMemberMiniGridCurrencies(availableCurrencies, useAll, useSelected);
      await refreshMiniGrid(seq, gridCur, dateFrom, dateTo, viewAccountId, companyId);
    },
    [
      viewAccountId,
      companyId,
      dateFrom,
      dateTo,
      isAllSelected,
      selectedCurrencies,
      availableCurrencies,
      refreshMiniGrid,
      showNotification,
    ],
  );

  const fetchMemberSummary = useCallback(
    async (seq = searchSeqRef.current) => {
      if (!viewAccountId || !companyId || !dateFrom || !dateTo) return false;
      if (summaryAbortRef.current) summaryAbortRef.current.abort();
      summaryAbortRef.current = new AbortController();
      try {
        const params = new URLSearchParams({
          date_from: dateFrom,
          date_to: dateTo,
          target_account_id: String(viewAccountId),
          company_id: String(companyId),
          show_inactive: "1",
          hide_zero_balance: "0",
        });
        const res = await fetch(buildApiUrl(`api/transactions/search_api.php?${params}&_t=${Date.now()}`), {
          credentials: "include",
          cache: "no-store",
          signal: summaryAbortRef.current.signal,
        });
        const json = await parseJsonResponse(await res.text());
        if (seq !== searchSeqRef.current) return false;
        if (!json?.success) throw new Error(json?.error || "Failed to load currency summary");
        const rows = [...(json.data?.left_table || []), ...(json.data?.right_table || [])].filter(
          (r) => Number(r.account_db_id) === Number(viewAccountId),
        );
        currencySortOrderRef.current = {};
        rows.forEach((row) => {
          const code = String(row.currency || "").trim();
          if (!code) return;
          const sortValue =
            typeof row.currency_id === "number"
              ? row.currency_id
              : parseInt(row.currency_id || "0", 10) || Number.MAX_SAFE_INTEGER;
          if (!currencySortOrderRef.current[code] || currencySortOrderRef.current[code] > sortValue) {
            currencySortOrderRef.current[code] = sortValue;
          }
        });
        setCurrencySummary(rows);
        if (rows.length > 0) {
          setIsAllSelected(true);
          setSelectedCurrencies([]);
        }
        return true;
      } catch (e) {
        if (e?.name === "AbortError") return false;
        if (seq !== searchSeqRef.current) return false;
        setCurrencySummary([]);
        currencySortOrderRef.current = {};
        showNotification(e?.message || "Failed to load currency data", "error");
        return false;
      }
    },
    [viewAccountId, companyId, dateFrom, dateTo, showNotification],
  );

  const performMemberSearch = useCallback(async () => {
    if (!viewAccountId || !companyId || !dateFrom || !dateTo) return;
    searchSeqRef.current += 1;
    const seq = searchSeqRef.current;
    setLoadingTable(true);
    setMiniGridShell(true);
    try {
      const summaryOk = await fetchMemberSummary(seq);
      if (seq !== searchSeqRef.current) return;
      if (summaryOk) {
        await loadCurrencyOrder();
      }
      await fetchMemberHistory(seq);
    } finally {
      if (seq === searchSeqRef.current) setLoadingTable(false);
    }
  }, [viewAccountId, companyId, dateFrom, dateTo, fetchMemberSummary, fetchMemberHistory, loadCurrencyOrder]);

  const initSession = useCallback((u, compId, from, to) => {
    const loginId = Number(u.member_login_account_id || u.user_id) || 0;
    const viewId = Number(u.member_winloss_view_account_id || u.winloss_view_account_id || u.user_id) || 0;
    setLoginRootAccountId(loginId);
    setViewAccountId(viewId);
    setCompanyId(Number(compId) || 0);
    setDateFrom(from);
    setDateTo(to);
  }, []);

  const reloadLinkedChain = useCallback(
    async (rootId, compId) => {
      setLinkedDataReady(false);
      await loadLinkedAccounts(rootId, compId);
    },
    [loadLinkedAccounts],
  );

  const switchCompany = useCallback(
    async (nextCompanyId, companyLabel) => {
      if (!nextCompanyId || Number(nextCompanyId) === Number(companyId)) return;
      try {
        const res = await fetch(buildApiUrl(`api/session/update_company_session_api.php?company_id=${nextCompanyId}`), {
          credentials: "include",
        });
        const json = await parseJsonResponse(await res.text());
        if (!json?.success) throw new Error(json?.error || "Failed to switch company");
        if (typeof window.updateSidebarDataCaptureVisibility === "function" && json?.data) {
          window.updateSidebarDataCaptureVisibility(json.data.has_gambling, json.data.has_bank);
        }
        setCompanyId(Number(nextCompanyId));
        showNotification(`Switched to company ${companyLabel || nextCompanyId}`, "success");
        await reloadLinkedChain(loginRootAccountId, Number(nextCompanyId));
        await loadOwnedCurrencies(viewAccountId, Number(nextCompanyId));
        await performMemberSearch();
      } catch (e) {
        showNotification(e?.message || "Failed to switch company", "error");
      }
    },
    [companyId, loginRootAccountId, viewAccountId, reloadLinkedChain, loadOwnedCurrencies, performMemberSearch, showNotification],
  );

  const switchAccount = useCallback(
    async (nextAccountId, code, name) => {
      if (!nextAccountId || Number(nextAccountId) === Number(viewAccountId)) return;
      try {
        const res = await fetch(buildApiUrl(`api/session/update_account_session_api.php?account_id=${nextAccountId}`), {
          credentials: "include",
        });
        const json = await parseJsonResponse(await res.text());
        if (!json?.success) throw new Error(json?.message || "Switch failed");
        const payload = json.data || json;
        const newId = Number(payload.account_id) || Number(nextAccountId);
        setViewAccountId(newId);
        showNotification(`Switched to account ${payload.account_code || code || name || newId}`, "success");
        await loadOwnedCurrencies(newId, companyId);
        await performMemberSearch();
      } catch (e) {
        showNotification(e?.message || "Failed to switch account", "error");
      }
    },
    [viewAccountId, companyId, loadOwnedCurrencies, performMemberSearch, showNotification],
  );

  const persistCurrencyOrder = useCallback(
    async (nextOrder) => {
      try {
        const res = await fetch(buildApiUrl("api/transactions/user_currency_order_api.php"), {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order: nextOrder }),
        });
        const json = await parseJsonResponse(await res.text());
        if (json?.success) {
          setCurrencyOrder(Array.isArray(json?.data?.order) ? json.data.order : nextOrder);
          setIsAllSelected(true);
          setSelectedCurrencies([]);
          showNotification("货币顺序已保存", "success");
          await fetchMemberHistory();
        }
      } catch {
        showNotification("保存顺序失败", "error");
      }
    },
    [fetchMemberHistory, showNotification],
  );

  const applyWlGridSelection = useCallback(
    (ids) => {
      setWlGridSelectedIds(ids);
      saveWLGridSelection(ids, companyId, loginRootAccountId);
      const sanitized = sanitizeCurrencySelection(
        availableCurrencies,
        isAllSelected,
        selectedCurrencies,
        linkedCurrenciesLoaded,
        linkedAccountCurrenciesMap,
        ids,
        linkedAccounts,
      );
      setIsAllSelected(sanitized.isAllSelected);
      setSelectedCurrencies(sanitized.selectedCurrencies);
      performMemberSearch();
    },
    [
      companyId,
      loginRootAccountId,
      availableCurrencies,
      isAllSelected,
      selectedCurrencies,
      linkedCurrenciesLoaded,
      linkedAccountCurrenciesMap,
      linkedAccounts,
      performMemberSearch,
    ],
  );

  const onCurrencyAll = useCallback(() => {
    if (isAllSelected) return;
    setIsAllSelected(true);
    setSelectedCurrencies([]);
    fetchMemberHistory(searchSeqRef.current, { isAllSelected: true, selectedCurrencies: [] });
  }, [isAllSelected, fetchMemberHistory]);

  const onCurrencyToggle = useCallback(
    (code) => {
      const nextSelected = selectedCurrencies.includes(code)
        ? selectedCurrencies.filter((c) => c !== code)
        : [...selectedCurrencies, code];
      setIsAllSelected(false);
      setSelectedCurrencies(nextSelected);
      fetchMemberHistory(searchSeqRef.current, { isAllSelected: false, selectedCurrencies: nextSelected });
    },
    [selectedCurrencies, fetchMemberHistory],
  );

  useEffect(() => {
    if (!availableCurrencies.length) {
      setIsAllSelected(true);
      setSelectedCurrencies([]);
      return;
    }
    const sanitized = sanitizeCurrencySelection(
      availableCurrencies,
      isAllSelected,
      selectedCurrencies,
      linkedCurrenciesLoaded,
      linkedAccountCurrenciesMap,
      wlGridSelectedIds,
      linkedAccounts,
    );
    setIsAllSelected(sanitized.isAllSelected);
    setSelectedCurrencies(sanitized.selectedCurrencies);
  }, [availableCurrencies, linkedCurrenciesLoaded, wlGridSelectedIds, linkedAccounts]);

  useEffect(() => {
    if (loginRootAccountId && companyId) {
      reloadLinkedChain(loginRootAccountId, companyId);
    }
  }, [loginRootAccountId, companyId, reloadLinkedChain]);

  useEffect(() => {
    if (viewAccountId && companyId) {
      loadOwnedCurrencies(viewAccountId, companyId);
    }
  }, [viewAccountId, companyId, loadOwnedCurrencies]);

  useEffect(() => {
    if (!linkedDataReady || !viewAccountId || !dateFrom || !dateTo) return;
    performMemberSearch();
    return () => {
      if (summaryAbortRef.current) summaryAbortRef.current.abort();
      if (historyAbortRef.current) historyAbortRef.current.abort();
      if (gridAbortRef.current) gridAbortRef.current.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- date/company/view drive search like legacy performMemberSearch
  }, [linkedDataReady, viewAccountId, companyId, dateFrom, dateTo]);

  return {
    loginRootAccountId,
    viewAccountId,
    companyId,
    setCompanyId,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    linkedAccounts,
    wlGridSelectedIds,
    linkedAccountCurrenciesMap,
    linkedCurrenciesLoaded,
    isAllSelected,
    selectedCurrencies,
    availableCurrencies,
    miniGridCurrencies,
    miniGridDisplayCurrencies,
    miniGridShell,
    miniGridBalances,
    miniGridTotals,
    miniGridHint,
    miniGridAccounts,
    showMiniRail,
    groupedRows,
    loadingTable,
    showLinkedFilterModal,
    setShowLinkedFilterModal,
    initSession,
    switchCompany,
    switchAccount,
    persistCurrencyOrder,
    applyWlGridSelection,
    onCurrencyAll,
    onCurrencyToggle,
    performMemberSearch,
    fetchMemberHistory,
    formatPaymentHistoryMoney,
  };
}
