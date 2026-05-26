import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import { useAuthSession } from "../../../context/AuthSessionContext.jsx";
import { notifyCompanySessionUpdated } from "../../../utils/company/companySessionEvents.js";
import {
  buildDashboardCacheKey,
  getDashboardCache,
  patchDashboardCache,
  setDashboardCache,
} from "../../../utils/dashboard/dashboardCache.js";
import { mergeGroupData } from "../../../utils/dashboard/dashboardMerge.js";
import {
  convertToBaseAmount,
  fetchFrankfurterRates,
  peekFrankfurterRatesCache,
  resolveFrankfurterDate,
  sumConvertedEarnings,
} from "../../../utils/dashboard/frankfurterRates.js";
import { DASHBOARD_API, DASHBOARD_PROFIT_COLOR } from "../lib/dashboardConstants.js";
import {
  buildChartRows,
  makeDashboardChartXTick,
  resolveDailyChartXAxisTicks,
} from "../lib/dashboardChart.jsx";
import {
  chartMonthSpan,
  formatDisplayDate,
  isFullCalendarMonth,
  parseYmd,
  previousPeriodRange,
  shouldAggregateChartByMonth,
} from "../lib/dashboardDateUtils.js";
import { formatI18nTemplate } from "../lib/dashboardFormat.js";
import { buildKpiCompare, computeKpiMetrics } from "../lib/dashboardKpi.js";
import {
  companiesInGroupList,
  pickDefaultCompanyForGroup,
} from "../../../utils/company/sharedCompanyFilter.js";
import { canUseGroupOnlyMode } from "../../../utils/company/loginScope.js";
import { sortIds } from "../lib/dashboardEarnings.js";
import {
  notifyDashboardGroupFilterChanged,
  isDashboardGroupOnlyMode,
  persistDashboardFilterState,
  applyLoginScopeToSessionStorageIfNeeded,
  resolveBootCompanyId,
  resolveInitialSelectedGroupFromSession,
  filterCompaniesForLoginScope,
  persistAccessibleGroupIdsFromApi,
} from "../../../utils/company/sharedCompanyFilter.js";
import { useGroupAnchorSessionSync } from "../../../utils/company/useGroupAnchorSessionSync.js";

export function useDashboardPage({ i18n, dateFrom, dateTo }) {
  const { me, sessionReady } = useAuthSession();
  const [loadError, setLoadError] = useState("");
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [groupAllMode, setGroupAllMode] = useState(false);
  const [mergedSubsetIds, setMergedSubsetIds] = useState(null);
  const [currencies, setCurrencies] = useState([]);
  const [currencyCode, setCurrencyCode] = useState("");
  const [dashboardData, setDashboardData] = useState(null);
  const [dashboardDataPrev, setDashboardDataPrev] = useState(null);
  const [loading, setLoading] = useState(true);
  const [earningsByCurrency, setEarningsByCurrency] = useState([]);
  const [earningsByCurrencyPrev, setEarningsByCurrencyPrev] = useState([]);
  const [earningsByCurrencyLoading, setEarningsByCurrencyLoading] = useState(false);
  const [exchangeRates, setExchangeRates] = useState({ rates: {}, date: null, unsupported: [] });
  const [exchangeRatesLoading, setExchangeRatesLoading] = useState(false);
  const [exchangeRatesError, setExchangeRatesError] = useState("");
  const [chartVisible, setChartVisible] = useState([true, true, true, true]);
  const [companyAccessModal, setCompanyAccessModal] = useState({ open: false, message: "" });
  /** Matches `dashboardScopeKey` when `dashboardData` reflects the active filter scope. */
  const [displayScopeKey, setDisplayScopeKey] = useState("");

  const currencyCodeRef = useRef(currencyCode);
  const earningsFetchGenRef = useRef(0);
  const dashboardFetchGenRef = useRef(0);
  const companySwitchGenRef = useRef(0);
  const currencyLoadGenRef = useRef(0);
  /** @type {React.MutableRefObject<Map<number, string[]>>} */
  const currenciesByCompanyRef = useRef(new Map());
  /** @type {React.MutableRefObject<Map<string, string[]>>} */
  const currenciesByGroupRef = useRef(new Map());

  const dashboardScopeKey = useMemo(
    () =>
      companyId
        ? buildDashboardCacheKey({
            companyId,
            dateFrom,
            dateTo,
            currencyCode,
            selectedGroup,
            groupAllMode,
            mergedSubsetIds,
          })
        : "",
    [companyId, dateFrom, dateTo, currencyCode, selectedGroup, groupAllMode, mergedSubsetIds]
  );

  useLayoutEffect(() => {
    document.body.classList.add("transaction-page");
    return () => document.body.classList.remove("transaction-page");
  }, []);

  const bootstrap = useCallback(async (signal) => {
    setLoadError("");
    if (!sessionReady || !me) return;
    try {
      const u = me;

      const cr = await fetch(buildApiUrl("api/transactions/get_owner_companies_api.php?all=1"), {
        credentials: "include",
        signal,
      });
      const cj = await cr.json();
      persistAccessibleGroupIdsFromApi(cj);
      if (!cr.ok || !cj.success || !Array.isArray(cj.data)) {
        setCompanies([]);
        setCompanyId(u.company_id);
        setLoadError(cj?.message || cj?.error || i18n.failedToLoadDashboard);
        return;
      }
      const scopedCompanies = filterCompaniesForLoginScope(cj.data, u);
      setCompanies(scopedCompanies);
      applyLoginScopeToSessionStorageIfNeeded(u, scopedCompanies);

      const fallbackId =
        scopedCompanies.length === 1
          ? parseInt(scopedCompanies[0].id, 10)
          : u.company_id
            ? parseInt(u.company_id, 10)
            : null;
      let cid = resolveBootCompanyId({ sessionCompanyId: fallbackId, defaultRowId: scopedCompanies[0]?.id });
      if (cid && !scopedCompanies.some((c) => parseInt(c.id, 10) === parseInt(cid, 10))) {
        cid = resolveBootCompanyId({ defaultRowId: parseInt(scopedCompanies[0].id, 10) });
      }

      const current =
        cid != null ? scopedCompanies.find((c) => parseInt(c.id, 10) === parseInt(cid, 10)) : null;
      const group = resolveInitialSelectedGroupFromSession(scopedCompanies, current, u);
      setSelectedGroup(group);

      if (isDashboardGroupOnlyMode() && canUseGroupOnlyMode(u)) {
        setCompanyId(null);
        return;
      }

      if (isDashboardGroupOnlyMode() && !canUseGroupOnlyMode(u)) {
        persistDashboardFilterState(group, cid, { allowGroupOnly: false });
      }

      let bootCid = cid != null ? parseInt(cid, 10) : null;
      if (bootCid == null && group) {
        const pick = pickDefaultCompanyForGroup(scopedCompanies, group, { me: u });
        if (pick?.id) bootCid = parseInt(pick.id, 10);
      }
      setCompanyId(bootCid);
      if (bootCid != null) persistDashboardFilterState(group, bootCid, { allowGroupOnly: false });
    } catch (err) {
      if (err?.name === "AbortError") return;
      setLoadError(err?.message || i18n.failedToLoadDashboard);
    }
  }, [sessionReady, me, i18n.failedToLoadDashboard]);

  useEffect(() => {
    if (!sessionReady || !me) return undefined;
    const controller = new AbortController();
    bootstrap(controller.signal);
    return () => controller.abort();
  }, [bootstrap, sessionReady, me]);

  useLayoutEffect(() => {
    notifyDashboardGroupFilterChanged(selectedGroup, companyId);
  }, [selectedGroup, companyId]);

  useGroupAnchorSessionSync({
    companies,
    selectedGroup,
    companyId,
    sessionCompanyId: me?.company_id,
  });

  const companiesForPicker = useMemo(
    () => companiesInGroupList(companies, selectedGroup),
    [companies, selectedGroup]
  );

  const groupIds = useMemo(
    () =>
      [...new Set(companies.filter((c) => c.group_id).map((c) => String(c.group_id).toUpperCase()))].sort(),
    [companies]
  );

  const applyCompanySelection = useCallback((id, options = {}) => {
    const clearSubset = options.clearSubset !== false;
    const clearGroupAll = options.clearGroupAll !== false;
    setCompanyId(parseInt(id, 10));
    if (clearGroupAll) setGroupAllMode(false);
    if (clearSubset) setMergedSubsetIds(null);
  }, []);

  const clearCompanySelection = useCallback((groupForPersist) => {
    const g =
      groupForPersist ??
      selectedGroup ??
      (typeof sessionStorage !== "undefined"
        ? sessionStorage.getItem("dashboard_group_filter")
        : null);
    persistDashboardFilterState(g, null);
    setCompanyId(null);
    setGroupAllMode(false);
    setMergedSubsetIds(null);
    setDashboardData(null);
    setDashboardDataPrev(null);
    setDisplayScopeKey("");
    setEarningsByCurrency([]);
    setEarningsByCurrencyLoading(false);
    setLoading(false);
    setLoadError("");
  }, [selectedGroup]);

  const syncCompanySession = useCallback(
    async (id) => {
      try {
        const res = await fetch(buildApiUrl(`api/session/update_company_session_api.php?company_id=${id}`), {
          credentials: "include",
        });
        const j = await res.json();
        if (!res.ok || !j.success) {
          const reason = String(j?.data?.reason || "").toLowerCase();
          const msg = String(j?.message || j?.error || "");
          const lower = msg.toLowerCase();
          const shouldShowModal =
            reason === "expired" ||
            reason === "no_set" ||
            lower.includes("company has expired") ||
            lower.includes("group has expired") ||
            lower.includes("company expiration date is not set") ||
            lower.includes("date is not set");
          if (shouldShowModal) {
            const modalMessage =
              reason === "expired"
                ? "This company since login has expired. Please contact the Customer Service."
                : reason === "no_set"
                  ? "Please contact the Customer Service to set the expiration date."
                  : lower.includes("not set")
                    ? "Please contact the Customer Service to set the expiration date."
                    : "This company since login has expired. Please contact the Customer Service.";
            setCompanyAccessModal({ open: true, message: modalMessage });
            setLoadError(modalMessage);
          } else {
            setLoadError(j.message || j.error || i18n.couldNotSwitchCompany);
          }
          return false;
        }
        if (typeof window.updateSidebarDataCaptureVisibility === "function" && j?.data) {
          window.updateSidebarDataCaptureVisibility(j.data.has_gambling, j.data.has_bank);
        }
        notifyCompanySessionUpdated();
        return true;
      } catch {
        setLoadError(i18n.couldNotSwitchCompany);
        return false;
      }
    },
    [i18n.couldNotSwitchCompany]
  );

  const applyCurrencyCodes = useCallback((codes, cid) => {
    setCurrencies(codes);
    setCurrencyCode((prev) => (prev && codes.includes(prev) ? prev : codes[0] || ""));
    if (cid != null && codes.length) currenciesByCompanyRef.current.set(cid, codes);
  }, []);

  const orderCurrencyCodes = useCallback((codes, order) => {
    if (!Array.isArray(order) || !order.length) return codes;
    const set = new Set(codes);
    const ordered = [...order.map((c) => String(c).toUpperCase()).filter((c) => set.has(c))];
    const rest = codes.filter((c) => !ordered.includes(c));
    return [...ordered, ...rest];
  }, []);

  const loadCurrencies = useCallback(async () => {
    const gen = ++currencyLoadGenRef.current;
    const singleCid = companyId != null ? parseInt(companyId, 10) : null;
    const groupKey = selectedGroup ? String(selectedGroup).trim().toUpperCase() : null;

    let companyIds = [];
    if (groupAllMode && groupKey) {
      companyIds = companiesInGroupList(companies, groupKey)
        .map((c) => parseInt(c.id, 10))
        .filter((id) => Number.isFinite(id));
    } else if (mergedSubsetIds && mergedSubsetIds.length > 1) {
      companyIds = mergedSubsetIds.filter((id) => Number.isFinite(id));
    } else if (singleCid) {
      companyIds = [singleCid];
    } else if (groupKey) {
      companyIds = companiesInGroupList(companies, groupKey)
        .map((c) => parseInt(c.id, 10))
        .filter((id) => Number.isFinite(id));
    }

    if (!companyIds.length) {
      setCurrencies([]);
      setCurrencyCode("");
      return;
    }

    if (singleCid) {
      const cached = currenciesByCompanyRef.current.get(singleCid);
      if (cached?.length) applyCurrencyCodes(cached, singleCid);
    } else if (groupKey) {
      const cached = currenciesByGroupRef.current.get(groupKey);
      if (cached?.length) applyCurrencyCodes(cached, null);
    }

    try {
      const ordRes = await fetch(buildApiUrl(`api/transactions/user_currency_order_api.php?_t=${Date.now()}`), {
        credentials: "include",
      }).catch(() => null);

      const currencyResults = await Promise.all(
        companyIds.map(async (cid) => {
          const curRes = await fetch(
            buildApiUrl(`api/transactions/get_company_currencies_api.php?company_id=${cid}`),
            { credentials: "include" }
          );
          const curJson = await curRes.json();
          if (!curRes.ok || !curJson.success || !Array.isArray(curJson.data)) return [];
          return curJson.data.map((r) => String(r.code).toUpperCase());
        })
      );
      if (gen !== currencyLoadGenRef.current) return;

      let codes = [...new Set(currencyResults.flat())];
      if (ordRes) {
        const ordJson = await ordRes.json();
        codes = orderCurrencyCodes(codes, ordJson?.data?.order);
      }
      if (gen !== currencyLoadGenRef.current) return;

      if (singleCid) {
        applyCurrencyCodes(codes, singleCid);
      } else if (groupKey) {
        applyCurrencyCodes(codes, null);
        if (codes.length) currenciesByGroupRef.current.set(groupKey, codes);
      }
    } catch {
      /* Keep visible currencies on error; stale-while-revalidate avoids flicker. */
    }
  }, [
    companyId,
    selectedGroup,
    groupAllMode,
    mergedSubsetIds,
    companies,
    applyCurrencyCodes,
    orderCurrencyCodes,
  ]);

  useEffect(() => {
    loadCurrencies();
  }, [loadCurrencies]);

  useEffect(() => {
    currencyCodeRef.current = currencyCode;
  }, [currencyCode]);

  const fetchDashboardPayload = useCallback(
    async (cid, rangeFrom, rangeTo, currencyOverride) => {
      const q = new URLSearchParams({
        date_from: rangeFrom,
        date_to: rangeTo,
        company_id: String(cid),
      });
      const cur = currencyOverride ?? currencyCodeRef.current;
      if (cur) q.append("currency", cur);
      if (selectedGroup) q.append("view_group", selectedGroup);
      const res = await fetch(buildApiUrl(`${DASHBOARD_API}?${q}`), { credentials: "include" });
      const json = await res.json();
      if (!res.ok || !json.success || !json.data) {
        throw new Error(json.message || json.error || i18n.dashboardApiError);
      }
      if (!selectedGroup) return json.data;
      const gf = String(selectedGroup).toUpperCase();
      const row = companies.find(
        (c) =>
          parseInt(c.id, 10) === parseInt(cid, 10) &&
          c.group_id &&
          String(c.group_id).toUpperCase() === gf
      );
      const pct = row && row.link_percentage !== undefined && row.link_percentage !== null
        ? parseFloat(row.link_percentage)
        : NaN;
      const linkMultiplier = Number.isFinite(pct) && pct >= 0 ? pct / 100 : 1;
      return linkMultiplier !== 1 ? { ...json.data, _link_multiplier: linkMultiplier } : json.data;
    },
    [selectedGroup, companies, i18n]
  );

  const loadMergedDashboard = useCallback(
    async (rangeFrom, rangeTo, currencyOverride) => {
      if (groupAllMode && selectedGroup) {
        const groupCompanies = companies.filter(
          (c) =>
            c.group_id &&
            String(c.group_id).toUpperCase() === selectedGroup &&
            c.company_id &&
            String(c.company_id).trim() !== ""
        );
        const results = await Promise.all(
          groupCompanies.map((c) => fetchDashboardPayload(c.id, rangeFrom, rangeTo, currencyOverride))
        );
        return mergeGroupData(results, { startDate: rangeFrom, endDate: rangeTo });
      }
      if (mergedSubsetIds && mergedSubsetIds.length > 1) {
        const results = await Promise.all(
          mergedSubsetIds.map((cid) => fetchDashboardPayload(cid, rangeFrom, rangeTo, currencyOverride))
        );
        return mergeGroupData(results, { startDate: rangeFrom, endDate: rangeTo });
      }
      return fetchDashboardPayload(companyId, rangeFrom, rangeTo, currencyOverride);
    },
    [companyId, groupAllMode, selectedGroup, mergedSubsetIds, companies, fetchDashboardPayload]
  );

  const fetchEarningsRowsForRange = useCallback(
    async (rangeFrom, rangeTo, gen) => {
      const rows = await Promise.all(
        currencies.map(async (code) => {
          try {
            const payload = await loadMergedDashboard(rangeFrom, rangeTo, code);
            if (gen !== earningsFetchGenRef.current) return null;
            const metrics = computeKpiMetrics(payload, selectedGroup);
            return { code, earnings: metrics?.earnings ?? 0 };
          } catch {
            if (gen !== earningsFetchGenRef.current) return null;
            return { code, earnings: 0 };
          }
        })
      );
      return rows.filter(Boolean);
    },
    [currencies, loadMergedDashboard, selectedGroup]
  );

  const loadEarningsByCurrency = useCallback(async () => {
    if (!companyId || currencies.length <= 1) {
      setEarningsByCurrency([]);
      setEarningsByCurrencyPrev([]);
      setEarningsByCurrencyLoading(false);
      return;
    }

    const cacheKey = dashboardScopeKey;
    const gen = ++earningsFetchGenRef.current;
    setEarningsByCurrencyLoading(true);
    setEarningsByCurrency(currencies.map((code) => ({ code, earnings: null })));
    setEarningsByCurrencyPrev([]);

    const prevRange = previousPeriodRange(dateFrom, dateTo);
    const [currentRows, prevRows] = await Promise.all([
      fetchEarningsRowsForRange(dateFrom, dateTo, gen),
      fetchEarningsRowsForRange(prevRange.from, prevRange.to, gen).catch(() => []),
    ]);

    if (gen === earningsFetchGenRef.current) {
      setEarningsByCurrency(currentRows);
      setEarningsByCurrencyPrev(prevRows);
      setEarningsByCurrencyLoading(false);
      if (cacheKey && currentRows.length) {
        patchDashboardCache(cacheKey, { earnings: currentRows });
      }
    }
  }, [
    companyId,
    currencies,
    dateFrom,
    dateTo,
    fetchEarningsRowsForRange,
    dashboardScopeKey,
  ]);

  useEffect(() => {
    if (!currencyCode || currencies.length <= 1) {
      setExchangeRates({ rates: { [currencyCode]: 1 }, date: null, unsupported: [] });
      setExchangeRatesError("");
      setExchangeRatesLoading(false);
      return undefined;
    }

    let cancelled = false;
    const rateDate = resolveFrankfurterDate(dateTo);
    const cached = peekFrankfurterRatesCache(currencyCode, currencies, rateDate);

    if (cached) {
      setExchangeRates({ rates: cached.rates, date: cached.date, unsupported: cached.unsupported });
      setExchangeRatesError("");
      setExchangeRatesLoading(false);
    } else {
      setExchangeRatesLoading(true);
      setExchangeRatesError("");
    }

    (async () => {
      try {
        const { rates, date, unsupported } = await fetchFrankfurterRates(
          currencyCode,
          currencies,
          rateDate
        );
        if (!cancelled) {
          setExchangeRates({ rates, date, unsupported });
          setExchangeRatesError("");
        }
      } catch {
        if (!cancelled) {
          setExchangeRates({ rates: { [currencyCode]: 1 }, date: null, unsupported: currencies });
          setExchangeRatesError("failed");
        }
      } finally {
        if (!cancelled) setExchangeRatesLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currencyCode, currencies, dateTo]);

  const loadDashboard = useCallback(async () => {
    if (!companyId || !dashboardScopeKey) return;
    const gen = ++dashboardFetchGenRef.current;
    const cacheKey = dashboardScopeKey;
    const cached = getDashboardCache(cacheKey);
    setLoadError("");

    if (cached?.current) {
      setDashboardData(cached.current);
      setDashboardDataPrev(cached.previous ?? null);
      setDisplayScopeKey(cacheKey);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setEarningsByCurrency([]);
    setEarningsByCurrencyPrev([]);

    try {
      const current = await loadMergedDashboard(dateFrom, dateTo, currencyCode);
      if (gen !== dashboardFetchGenRef.current) return;
      setDashboardData(current);
      setDisplayScopeKey(cacheKey);
      setLoading(false);
      patchDashboardCache(cacheKey, { current, previous: cached?.previous ?? null });

      const prevRange = previousPeriodRange(dateFrom, dateTo);
      const previous = await loadMergedDashboard(prevRange.from, prevRange.to, currencyCode).catch(() => null);
      if (gen !== dashboardFetchGenRef.current) return;
      setDashboardDataPrev(previous);
      patchDashboardCache(cacheKey, { current, previous });
    } catch (e) {
      if (gen !== dashboardFetchGenRef.current) return;
      setLoadError(e.message || i18n.failedToLoadDashboard);
      if (!cached?.current) {
        setDashboardData(null);
        setDashboardDataPrev(null);
      }
    } finally {
      if (gen === dashboardFetchGenRef.current) setLoading(false);
    }
  }, [
    companyId,
    dateFrom,
    dateTo,
    currencyCode,
    loadMergedDashboard,
    i18n,
    dashboardScopeKey,
  ]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    if (loading || !dashboardData || currencies.length <= 1) return undefined;
    const timer = window.setTimeout(() => loadEarningsByCurrency(), 0);
    return () => window.clearTimeout(timer);
  }, [loading, dashboardData, currencies.length, loadEarningsByCurrency]);

  const kpiCompareLabel = useMemo(
    () => (isFullCalendarMonth(dateFrom, dateTo) ? i18n.thanLastMonth : i18n.thanPreviousPeriod),
    [dateFrom, dateTo, i18n.thanLastMonth, i18n.thanPreviousPeriod]
  );

  const kpi = useMemo(() => {
    const empty = {
      profit: 0,
      expenses: 0,
      netProfit: 0,
      earnings: 0,
      showEarnings: false,
      comparisons: null,
    };
    const current = computeKpiMetrics(dashboardData, selectedGroup);
    if (!current) return empty;
    const previous = computeKpiMetrics(dashboardDataPrev, selectedGroup);
    const comparisons = previous
      ? {
          profit: buildKpiCompare(current.profit, previous.profit),
          expenses: buildKpiCompare(current.expenses, previous.expenses),
          netProfit: buildKpiCompare(current.netProfit, previous.netProfit),
          earnings: buildKpiCompare(current.earnings, previous.earnings),
        }
      : null;
    return { ...current, comparisons };
  }, [dashboardData, dashboardDataPrev, selectedGroup]);

  const chartAggregateByMonth = useMemo(
    () => shouldAggregateChartByMonth(dateFrom, dateTo),
    [dateFrom, dateTo]
  );

  const chartRows = useMemo(
    () => (dashboardData ? buildChartRows(dashboardData, dateFrom, dateTo, i18n.locale) : []),
    [dashboardData, dateFrom, dateTo, i18n.locale]
  );

  const chartMonthSpanCount = useMemo(
    () => chartMonthSpan(dateFrom, dateTo),
    [dateFrom, dateTo]
  );

  const chartXAxisLayout = useMemo(() => {
    const n = chartRows.length;
    const compact = !chartAggregateByMonth && n > 14;
    const marginBottom = compact ? 22 : 20;
    const tickSkip = chartAggregateByMonth
      ? { interval: 0, minTickGap: 0 }
      : resolveDailyChartXAxisTicks(n, chartMonthSpanCount);
    return {
      ...tickSkip,
      tick: makeDashboardChartXTick(compact),
      height: marginBottom,
      marginBottom,
    };
  }, [chartRows.length, chartAggregateByMonth, chartMonthSpanCount]);

  const kpiFooter = useMemo(() => {
    const cur = currencyCode || "—";
    const from = parseYmd(dateFrom);
    const to = parseYmd(dateTo);
    const loc = i18n.locale;
    if (from.getFullYear() === to.getFullYear() && from.getMonth() === to.getMonth()) {
      const monthYear = to.toLocaleDateString(loc, { month: "short", year: "numeric" });
      return `${cur} · ${monthYear}`;
    }
    const left = from.toLocaleDateString(loc, { month: "short", day: "numeric" });
    const right = to.toLocaleDateString(loc, { month: "short", day: "numeric", year: "numeric" });
    return `${cur} · ${left} – ${right}`;
  }, [currencyCode, dateFrom, dateTo, i18n.locale]);

  const chartDateRangeText = useMemo(() => {
    if (dashboardData?.date_range) {
      return `${formatDisplayDate(dashboardData.date_range.from)} ${i18n.to} ${formatDisplayDate(
        dashboardData.date_range.to
      )}`;
    }
    return `${formatDisplayDate(dateFrom)} ${i18n.to} ${formatDisplayDate(dateTo)}`;
  }, [dashboardData, dateFrom, dateTo, i18n.to]);

  const chartSeries = useMemo(() => {
    const series = [
      { idx: 0, label: i18n.profit, color: DASHBOARD_PROFIT_COLOR, dataKey: "profit", fill: "url(#gProfit)" },
      { idx: 1, label: i18n.expenses, color: "#ef4444", dataKey: "expenses", fill: "url(#gExp)" },
      { idx: 2, label: i18n.netProfitChart, color: "#10b981", dataKey: "netProfit", fill: "url(#gNet)" },
    ];
    if (kpi.showEarnings) {
      series.push({ idx: 3, label: i18n.earnings, color: "#f59e0b", dataKey: "earnings", fill: "url(#gEarn)" });
    }
    return series;
  }, [i18n, kpi.showEarnings]);

  const earningsCurrencyRows = useMemo(() => {
    const baseRows = earningsByCurrency.length
      ? earningsByCurrency
      : currencies.map((code) => ({
          code,
          earnings: code === currencyCode && dashboardData ? kpi.earnings : null,
        }));

    const base = String(currencyCode || "").toUpperCase();
    const rates = exchangeRates.rates || {};
    const canConvert =
      currencies.length > 1 &&
      !exchangeRatesError &&
      Object.keys(rates).length > 0 &&
      !exchangeRatesLoading;

    return baseRows.map((row) => {
      const earningsConverted =
        canConvert && row.earnings != null
          ? convertToBaseAmount(row.earnings, row.code, base, rates)
          : null;
      return {
        ...row,
        earningsConverted,
      };
    });
  }, [
    earningsByCurrency,
    currencies,
    currencyCode,
    kpi.earnings,
    dashboardData,
    exchangeRates.rates,
    exchangeRatesError,
    exchangeRatesLoading,
  ]);

  const allCurrencyEarningsReady = useMemo(
    () =>
      currencies.length <= 1 ||
      (earningsCurrencyRows.length === currencies.length &&
        earningsCurrencyRows.every((row) => row.earnings != null)),
    [currencies.length, earningsCurrencyRows]
  );

  const useConvertedEarnings = useMemo(
    () =>
      currencies.length > 1 &&
      !exchangeRatesError &&
      !exchangeRatesLoading &&
      Object.keys(exchangeRates.rates || {}).length > 0 &&
      allCurrencyEarningsReady,
    [
      currencies.length,
      exchangeRatesError,
      exchangeRatesLoading,
      exchangeRates.rates,
      allCurrencyEarningsReady,
    ]
  );

  const convertedEarningsTotal = useMemo(() => {
    if (!useConvertedEarnings) return null;
    return sumConvertedEarnings(earningsCurrencyRows, currencyCode, exchangeRates.rates).total;
  }, [useConvertedEarnings, earningsCurrencyRows, currencyCode, exchangeRates.rates]);

  const earningsCurrencyRowsPrev = useMemo(() => {
    if (!earningsByCurrencyPrev.length) return [];
    const base = String(currencyCode || "").toUpperCase();
    const rates = exchangeRates.rates || {};
    const canConvert =
      currencies.length > 1 &&
      !exchangeRatesError &&
      Object.keys(rates).length > 0 &&
      !exchangeRatesLoading;

    return earningsByCurrencyPrev.map((row) => ({
      ...row,
      earningsConverted:
        canConvert && row.earnings != null
          ? convertToBaseAmount(row.earnings, row.code, base, rates)
          : null,
    }));
  }, [
    earningsByCurrencyPrev,
    currencyCode,
    currencies.length,
    exchangeRates.rates,
    exchangeRatesError,
    exchangeRatesLoading,
  ]);

  const convertedEarningsTotalPrev = useMemo(() => {
    if (!useConvertedEarnings || !earningsCurrencyRowsPrev.length) return null;
    return sumConvertedEarnings(earningsCurrencyRowsPrev, currencyCode, exchangeRates.rates).total;
  }, [useConvertedEarnings, earningsCurrencyRowsPrev, currencyCode, exchangeRates.rates]);

  const summaryEarningsValue = useMemo(() => {
    if (useConvertedEarnings && convertedEarningsTotal != null) {
      return convertedEarningsTotal;
    }
    return kpi.earnings;
  }, [useConvertedEarnings, convertedEarningsTotal, kpi.earnings]);

  const summaryConversionNote = useMemo(() => {
    if (!useConvertedEarnings || currencies.length <= 1) return "";
    return i18n.earningsIncludesConversion;
  }, [useConvertedEarnings, currencies.length, i18n.earningsIncludesConversion]);

  const rateFootnoteText = useMemo(() => {
    if (currencies.length <= 1) return "";
    if (exchangeRatesLoading) return i18n.rateLoading;
    if (exchangeRatesError) return i18n.rateUnavailable;
    const foreignCodes = currencies
      .map((c) => String(c).toUpperCase())
      .filter((c) => c !== String(currencyCode).toUpperCase());
    if (!foreignCodes.length) return "";
    const dateLabel = exchangeRates.date || "—";
    let text = formatI18nTemplate(i18n.rateFootnote, {
      codes: foreignCodes.join(", "),
      date: dateLabel,
    });
    if (exchangeRates.unsupported?.length) {
      text += ` · ${i18n.rateUnavailable}`;
    }
    return text;
  }, [
    currencies,
    currencyCode,
    exchangeRatesLoading,
    exchangeRatesError,
    exchangeRates.date,
    exchangeRates.unsupported,
    i18n,
  ]);

  const scopeDataPending =
    Boolean(dashboardScopeKey) && displayScopeKey !== dashboardScopeKey;
  const summaryEarningsLoading =
    scopeDataPending ||
    (loading && !dashboardData) ||
    (currencies.length > 1 &&
      !exchangeRatesError &&
      (earningsByCurrencyLoading ||
        exchangeRatesLoading ||
        !allCurrencyEarningsReady ||
        (useConvertedEarnings && convertedEarningsTotal == null)));
  const kpiLoading = scopeDataPending || (loading && !dashboardData);

  const handlePickGroup = useCallback(
    (gid) => {
      const g = String(gid || "").trim().toUpperCase();
      if (!g) return;
      if (g === selectedGroup && companyId != null) return;

      setSelectedGroup(g);
      sessionStorage.setItem("dashboard_group_filter", g);

      if (canUseGroupOnlyMode(me)) {
        clearCompanySelection(g);
        notifyDashboardGroupFilterChanged(g, null);
        return;
      }

      const pick = pickDefaultCompanyForGroup(companies, g, { me, preferredCompanyId: companyId });
      if (!pick?.id) {
        clearCompanySelection(g);
        notifyDashboardGroupFilterChanged(g, null);
        return;
      }

      const id = parseInt(pick.id, 10);
      setGroupAllMode(false);
      setMergedSubsetIds(null);
      persistDashboardFilterState(g, id, { allowGroupOnly: false });
      applyCompanySelection(id);
      notifyDashboardGroupFilterChanged(g, id);
      void syncCompanySession(id);
    },
    [
      selectedGroup,
      companyId,
      me,
      companies,
      clearCompanySelection,
      applyCompanySelection,
      syncCompanySession,
    ]
  );

  const handlePickCompany = useCallback(
    (c) => {
      const id = parseInt(c.id, 10);
      const gid = c.group_id ? String(c.group_id).toUpperCase() : null;
      const isActive =
        !groupAllMode &&
        !(mergedSubsetIds && mergedSubsetIds.length > 1) &&
        companyId != null &&
        parseInt(companyId, 10) === id &&
        (!gid || gid === selectedGroup);
      if (isActive) {
        if (!canUseGroupOnlyMode(me)) return;
        clearCompanySelection();
        return;
      }

      const switchGen = ++companySwitchGenRef.current;
      const prevId = companyId;
      if (gid) {
        setSelectedGroup(gid);
        sessionStorage.setItem("dashboard_group_filter", gid);
      } else {
        setSelectedGroup(null);
        sessionStorage.removeItem("dashboard_group_filter");
      }
      persistDashboardFilterState(gid, id);
      applyCompanySelection(id);
      void syncCompanySession(id).then((ok) => {
        if (switchGen !== companySwitchGenRef.current) return;
        if (!ok && prevId != null) {
          const prevCo = companies.find((x) => parseInt(x.id, 10) === parseInt(prevId, 10));
          if (prevCo?.group_id) {
            setSelectedGroup(String(prevCo.group_id).toUpperCase());
            sessionStorage.setItem("dashboard_group_filter", String(prevCo.group_id).toUpperCase());
          }
          applyCompanySelection(prevId);
        }
      });
    },
    [
      companyId,
      selectedGroup,
      groupAllMode,
      mergedSubsetIds,
      companies,
      applyCompanySelection,
      syncCompanySession,
      clearCompanySelection,
      me,
    ]
  );

  const handlePickAllInGroup = useCallback(() => {
    if (!canUseGroupOnlyMode(me)) {
      const list = companiesInGroupList(companies, selectedGroup);
      if (list[0]) handlePickCompany(list[0]);
      return;
    }
    if (!selectedGroup) return;
    const list = companiesInGroupList(companies, selectedGroup);
    const allIds = sortIds(list.map((c) => parseInt(c.id, 10)));
    if (allIds.length <= 1) {
      if (list[0]) handlePickCompany(list[0]);
      return;
    }
    const switchGen = ++companySwitchGenRef.current;
    const prevId = companyId;
    setGroupAllMode(true);
    setMergedSubsetIds(null);
    applyCompanySelection(allIds[0], { clearGroupAll: false, clearSubset: true });
    void syncCompanySession(allIds[0]).then((ok) => {
      if (switchGen !== companySwitchGenRef.current) return;
      if (!ok && prevId != null) {
        setGroupAllMode(false);
        applyCompanySelection(prevId, { clearGroupAll: false, clearSubset: true });
      }
    });
  }, [selectedGroup, companies, handlePickCompany, companyId, applyCompanySelection, syncCompanySession, me]);

  useLayoutEffect(() => {
    if (!me || canUseGroupOnlyMode(me) || !selectedGroup || companyId != null) return;
    const pick = pickDefaultCompanyForGroup(companies, selectedGroup, { me, preferredCompanyId: companyId });
    if (!pick?.id) return;
    const id = parseInt(pick.id, 10);
    setGroupAllMode(false);
    persistDashboardFilterState(selectedGroup, id, { allowGroupOnly: false });
    applyCompanySelection(id);
    notifyDashboardGroupFilterChanged(selectedGroup, id);
    void syncCompanySession(id);
  }, [me, selectedGroup, companyId, companies, applyCompanySelection, syncCompanySession]);

  const toggleChartSeries = useCallback((idx) => {
    setChartVisible((v) => {
      const n = [...v];
      n[idx] = !n[idx];
      return n;
    });
  }, []);

  const closeCompanyAccessModal = useCallback(() => {
    setCompanyAccessModal({ open: false, message: "" });
  }, []);

  return {
    me,
    loadError,
    companyAccessModal,
    closeCompanyAccessModal,
    companiesForPicker,
    groupIds,
    selectedGroup,
    groupAllMode,
    mergedSubsetIds,
    companyId,
    currencies,
    currencyCode,
    setCurrencyCode,
    loading: kpiLoading,
    dashboardData,
    kpi,
    kpiCompareLabel,
    kpiFooter,
    chartRows,
    chartSeries,
    chartVisible,
    toggleChartSeries,
    chartDateRangeText,
    chartXAxisLayout,
    earningsCurrencyRows,
    useConvertedEarnings,
    summaryEarningsValue,
    summaryConversionNote,
    summaryEarningsLoading,
    earningsByCurrencyLoading,
    exchangeRates,
    exchangeRatesError,
    exchangeRatesLoading,
    rateFootnoteText,
    convertedEarningsTotal,
    handlePickGroup,
    handlePickCompany,
    handlePickAllInGroup,
    showAllInGroup: canUseGroupOnlyMode(me),
  };
}
