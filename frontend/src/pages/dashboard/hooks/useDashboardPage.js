import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import { notifyCompanySessionUpdated } from "../../../utils/company/companySessionEvents.js";
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
import { companiesInGroupList, sortIds } from "../lib/dashboardEarnings.js";

export function useDashboardPage({ i18n, dateFrom, dateTo }) {
  const navigate = useNavigate();
  const [me, setMe] = useState(null);
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
  const [earningsByCurrencyLoading, setEarningsByCurrencyLoading] = useState(false);
  const [exchangeRates, setExchangeRates] = useState({ rates: {}, date: null, unsupported: [] });
  const [exchangeRatesLoading, setExchangeRatesLoading] = useState(false);
  const [exchangeRatesError, setExchangeRatesError] = useState("");
  const [chartVisible, setChartVisible] = useState([true, true, true, true]);
  const [companyAccessModal, setCompanyAccessModal] = useState({ open: false, message: "" });

  const currencyCodeRef = useRef(currencyCode);
  const earningsFetchGenRef = useRef(0);
  const dashboardFetchGenRef = useRef(0);

  useLayoutEffect(() => {
    document.body.classList.add("transaction-page");
    return () => document.body.classList.remove("transaction-page");
  }, []);

  const bootstrap = useCallback(async () => {
    setLoadError("");
    try {
      const res = await fetch(buildApiUrl("api/session/current_user_api.php"), { credentials: "include" });
      const json = await res.json();
      if (!res.ok || !json.success || !json.data) {
        navigate("/login", { replace: true });
        return;
      }
      const u = json.data;
      if (u.user_type === "member") {
        window.location.assign(new URL("/member", window.location.origin).href);
        return;
      }
      if (u.needs_owner_secondary) {
        window.location.assign(new URL("/owner-secondary-password", window.location.origin).href);
        return;
      }
      setMe(u);

      const cr = await fetch(buildApiUrl("api/transactions/get_owner_companies_api.php?all=1"), {
        credentials: "include",
      });
      const cj = await cr.json();
      if (!cr.ok || !cj.success || !Array.isArray(cj.data)) {
        setCompanies([]);
        setCompanyId(u.company_id);
        return;
      }
      setCompanies(cj.data);

      const savedGroup = sessionStorage.getItem("dashboard_group_filter");
      const groups = [
        ...new Set(
          cj.data.filter((c) => c.group_id).map((c) => String(c.group_id).toUpperCase())
        ),
      ].sort();

      let group = null;
      const current = cj.data.find((c) => parseInt(c.id, 10) === parseInt(u.company_id, 10));
      if (savedGroup && groups.includes(savedGroup) && current?.group_id?.toUpperCase() === savedGroup) {
        group = savedGroup;
      } else if (savedGroup && !groups.includes(savedGroup)) {
        sessionStorage.removeItem("dashboard_group_filter");
      }
      if (!group && current?.group_id?.trim()) {
        group = String(current.group_id).toUpperCase();
        sessionStorage.setItem("dashboard_group_filter", group);
      }
      setSelectedGroup(group);

      let cid = u.company_id;
      if (cj.data.length === 1) {
        cid = parseInt(cj.data[0].id, 10);
      } else if (cid && !cj.data.some((c) => parseInt(c.id, 10) === parseInt(cid, 10))) {
        cid = parseInt(cj.data[0].id, 10);
      }
      setCompanyId(cid ? parseInt(cid, 10) : null);
    } catch {
      navigate("/login", { replace: true });
    }
  }, [navigate]);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const companiesForPicker = useMemo(
    () => companiesInGroupList(companies, selectedGroup),
    [companies, selectedGroup]
  );

  const groupIds = useMemo(
    () =>
      [...new Set(companies.filter((c) => c.group_id).map((c) => String(c.group_id).toUpperCase()))].sort(),
    [companies]
  );

  const switchCompany = async (id, options = {}) => {
    const clearSubset = options.clearSubset !== false;
    const clearGroupAll = options.clearGroupAll !== false;
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
    setCompanyId(parseInt(id, 10));
    if (clearGroupAll) setGroupAllMode(false);
    if (clearSubset) setMergedSubsetIds(null);
    notifyCompanySessionUpdated();
    return true;
  };

  const loadCurrencies = useCallback(async () => {
    if (!companyId) return;
    try {
      const [curRes, ordRes] = await Promise.all([
        fetch(buildApiUrl(`api/transactions/get_company_currencies_api.php?company_id=${companyId}`), {
          credentials: "include",
        }),
        fetch(buildApiUrl(`api/transactions/user_currency_order_api.php?_t=${Date.now()}`), {
          credentials: "include",
        }).catch(() => null),
      ]);
      const curJson = await curRes.json();
      if (!curRes.ok || !curJson.success || !Array.isArray(curJson.data)) {
        setCurrencies([]);
        return;
      }
      let codes = curJson.data.map((r) => String(r.code).toUpperCase());
      if (ordRes) {
        const ordJson = await ordRes.json();
        const order = ordJson?.data?.order;
        if (Array.isArray(order) && order.length) {
          const set = new Set(codes);
          const ordered = [...order.map((c) => String(c).toUpperCase()).filter((c) => set.has(c))];
          const rest = codes.filter((c) => !ordered.includes(c));
          codes = [...ordered, ...rest];
        }
      }
      setCurrencies(codes);
      setCurrencyCode((prev) => (prev && codes.includes(prev) ? prev : codes[0] || ""));
    } catch {
      setCurrencies([]);
    }
  }, [companyId]);

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

  const loadEarningsByCurrency = useCallback(async () => {
    if (!companyId || currencies.length <= 1) {
      setEarningsByCurrency([]);
      setEarningsByCurrencyLoading(false);
      return;
    }

    const gen = ++earningsFetchGenRef.current;
    setEarningsByCurrencyLoading(true);
    setEarningsByCurrency(currencies.map((code) => ({ code, earnings: null })));

    await Promise.all(
      currencies.map(async (code) => {
        try {
          const current = await loadMergedDashboard(dateFrom, dateTo, code);
          if (gen !== earningsFetchGenRef.current) return;
          const metrics = computeKpiMetrics(current, selectedGroup);
          setEarningsByCurrency((prev) =>
            prev.map((row) =>
              row.code === code ? { ...row, earnings: metrics?.earnings ?? 0 } : row
            )
          );
        } catch {
          if (gen !== earningsFetchGenRef.current) return;
          setEarningsByCurrency((prev) =>
            prev.map((row) => (row.code === code ? { ...row, earnings: 0 } : row))
          );
        }
      })
    );

    if (gen === earningsFetchGenRef.current) {
      setEarningsByCurrencyLoading(false);
    }
  }, [companyId, currencies, dateFrom, dateTo, loadMergedDashboard, selectedGroup]);

  useEffect(() => {
    if (!dashboardData || !currencyCode || currencies.length <= 1) return;
    const metrics = computeKpiMetrics(dashboardData, selectedGroup);
    setEarningsByCurrency((prev) => {
      const base =
        prev.length === currencies.length
          ? prev
          : currencies.map((code) => ({ code, earnings: null }));
      return base.map((row) =>
        row.code === currencyCode ? { ...row, earnings: metrics?.earnings ?? 0 } : row
      );
    });
  }, [dashboardData, currencyCode, selectedGroup, currencies]);

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
    if (!companyId) return;
    const gen = ++dashboardFetchGenRef.current;
    setLoadError("");
    setLoading(true);

    try {
      const prevRange = previousPeriodRange(dateFrom, dateTo);
      const [current, previous] = await Promise.all([
        loadMergedDashboard(dateFrom, dateTo, currencyCode),
        loadMergedDashboard(prevRange.from, prevRange.to, currencyCode).catch(() => null),
      ]);
      if (gen !== dashboardFetchGenRef.current) return;
      setDashboardData(current);
      setDashboardDataPrev(previous);
    } catch (e) {
      if (gen !== dashboardFetchGenRef.current) return;
      setLoadError(e.message || i18n.failedToLoadDashboard);
      setDashboardData(null);
      setDashboardDataPrev(null);
    } finally {
      if (gen === dashboardFetchGenRef.current) setLoading(false);
    }
  }, [companyId, dateFrom, dateTo, currencyCode, loadMergedDashboard, i18n]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    setDashboardData(null);
    setDashboardDataPrev(null);
  }, [companyId, dateFrom, dateTo]);

  useEffect(() => {
    loadEarningsByCurrency();
  }, [loadEarningsByCurrency]);

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

  const summaryEarningsLoading = loading && !dashboardData;

  const handlePickGroup = useCallback(
    async (gid) => {
      const g = String(gid || "").trim().toUpperCase();
      if (!g || g === selectedGroup) return;
      const list = companiesInGroupList(companies, g);
      const allIds = sortIds(list.map((c) => parseInt(c.id, 10)));
      if (!allIds.length) return;
      setSelectedGroup(g);
      sessionStorage.setItem("dashboard_group_filter", g);
      setGroupAllMode(false);
      setMergedSubsetIds(null);
      await switchCompany(allIds[0], { clearGroupAll: true, clearSubset: true });
    },
    [companies, selectedGroup]
  );

  const handlePickCompany = useCallback(
    async (c) => {
      const id = parseInt(c.id, 10);
      const gid = c.group_id ? String(c.group_id).toUpperCase() : null;
      const isActive =
        !groupAllMode &&
        !(mergedSubsetIds && mergedSubsetIds.length > 1) &&
        parseInt(companyId, 10) === id &&
        (!gid || gid === selectedGroup);
      if (isActive) return;

      if (gid) {
        setSelectedGroup(gid);
        sessionStorage.setItem("dashboard_group_filter", gid);
      } else {
        setSelectedGroup(null);
        sessionStorage.removeItem("dashboard_group_filter");
      }
      setGroupAllMode(false);
      setMergedSubsetIds(null);
      await switchCompany(id);
    },
    [companyId, selectedGroup, groupAllMode, mergedSubsetIds]
  );

  const handlePickAllInGroup = useCallback(async () => {
    if (!selectedGroup) return;
    const list = companiesInGroupList(companies, selectedGroup);
    const allIds = sortIds(list.map((c) => parseInt(c.id, 10)));
    if (allIds.length <= 1) {
      if (list[0]) await handlePickCompany(list[0]);
      return;
    }
    setGroupAllMode(true);
    setMergedSubsetIds(null);
    await switchCompany(allIds[0], { clearGroupAll: false, clearSubset: true });
  }, [selectedGroup, companies, handlePickCompany]);

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
    loading,
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
  };
}
