import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { buildApiUrl } from "../utils/apiUrl.js";
import { notifyCompanySessionUpdated } from "../utils/companySessionEvents.js";
import { mergeGroupData } from "../utils/dashboardMerge.js";
import { DASHBOARD_I18N } from "../translateFile/dashboardTranslate.js";

const DASHBOARD_API = "api/transactions/dashboard_api.php";

function formatYmd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseYmd(s) {
  const [y, m, d] = String(s).split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function eachDateInRange(startYmd, endYmd) {
  const out = [];
  const start = parseYmd(startYmd);
  const end = parseYmd(endYmd);
  for (let x = new Date(start); x <= end; x.setDate(x.getDate() + 1)) {
    out.push(formatYmd(new Date(x)));
  }
  return out;
}

function formatDisplayDate(ymd) {
  const d = parseYmd(ymd);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function formatCurrency(value) {
  return parseFloat(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function quickRangeToDates(range) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let startDate;
  let endDate;
  switch (range) {
    case "today":
      startDate = new Date(today);
      endDate = new Date(today);
      break;
    case "yesterday": {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      startDate = y;
      endDate = y;
      break;
    }
    case "thisWeek": {
      const w = new Date(today);
      const dayOfWeek = w.getDay();
      const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      w.setDate(w.getDate() - daysToMonday);
      startDate = w;
      endDate = new Date(today);
      break;
    }
    case "lastWeek": {
      const lastWeekEnd = new Date(today);
      const lastWeekDayOfWeek = lastWeekEnd.getDay();
      const daysToLastSunday = lastWeekDayOfWeek === 0 ? 0 : lastWeekDayOfWeek;
      lastWeekEnd.setDate(lastWeekEnd.getDate() - daysToLastSunday - 1);
      const lastWeekStart = new Date(lastWeekEnd);
      lastWeekStart.setDate(lastWeekStart.getDate() - 6);
      startDate = lastWeekStart;
      endDate = lastWeekEnd;
      break;
    }
    case "thisMonth":
      startDate = new Date(today.getFullYear(), today.getMonth(), 1);
      endDate = new Date(today);
      break;
    case "lastMonth": {
      const lm = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lmEnd = new Date(today.getFullYear(), today.getMonth(), 0);
      startDate = lm;
      endDate = lmEnd;
      break;
    }
    case "thisYear":
      startDate = new Date(today.getFullYear(), 0, 1);
      endDate = new Date(today);
      break;
    case "lastYear":
      startDate = new Date(today.getFullYear() - 1, 0, 1);
      endDate = new Date(today.getFullYear() - 1, 11, 31);
      break;
    default:
      return null;
  }
  return { startDate: formatYmd(startDate), endDate: formatYmd(endDate) };
}

function buildCalendarCells(year, month) {
  const firstDay = new Date(year, month - 1, 1);
  const offset = firstDay.getDay();
  const start = new Date(firstDay);
  start.setDate(firstDay.getDate() - offset);
  const cells = [];
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push({
      ymd: formatYmd(d),
      day: d.getDate(),
      inCurrentMonth: d.getMonth() === month - 1,
      isToday: formatYmd(d) === formatYmd(new Date()),
    });
  }
  return cells;
}

function normalizeRange(from, to) {
  return from <= to ? [from, to] : [to, from];
}

function companiesInGroupList(companies, gid) {
  if (!gid) {
    return companies.filter(
      (c) => c.company_id && String(c.company_id).trim() !== "" && (!c.group_id || String(c.group_id).trim() === "")
    );
  }
  return companies.filter(
    (c) =>
      c.company_id &&
      String(c.company_id).trim() !== "" &&
      c.group_id &&
      String(c.group_id).toUpperCase() === String(gid).toUpperCase()
  );
}

function sortIds(ids) {
  return [...ids].sort((a, b) => a - b);
}


function buildChartRows(data, startYmd, endYmd) {
  if (!data?.daily_data) return [];
  const dailyData = data.daily_data;
  const ownershipPercentage = parseFloat(data?.ownership_percentage) || 0;
  const groupEquityPercentage = parseFloat(data?.group_equity_percentage) || 0;
  const groupAccountPercentage = parseFloat(data?.group_account_percentage) || 0;
  const hasGroupOwnership = !!data?.has_group_ownership;
  const earningsMultiplier = hasGroupOwnership
    ? ownershipPercentage / 100 + (groupEquityPercentage / 100) * (groupAccountPercentage / 100)
    : ownershipPercentage / 100;

  const dates = eachDateInRange(startYmd, endYmd);
  return dates.map((date) => {
    const profitDelta = parseFloat(dailyData.profit?.[date] || 0) || 0;
    const expensesDelta = parseFloat(dailyData.expenses?.[date] || 0) || 0;
    const displayProfit = profitDelta;
    const displayExpenses = expensesDelta > 0 ? -expensesDelta : expensesDelta;
    const netProfit = displayProfit + displayExpenses;
    const earnings = netProfit * earningsMultiplier;
    const label = `${parseYmd(date).getDate()}/${parseYmd(date).getMonth() + 1}`;
    return {
      date,
      label,
      profit: displayProfit,
      expenses: displayExpenses,
      netProfit,
      earnings,
    };
  });
}

export default function TransactionDashboardPage() {
  const navigate = useNavigate();
  const [me, setMe] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [groupAllMode, setGroupAllMode] = useState(false);
  /** Non-null with length ≥ 2 → merge dashboard for these company IDs (subset of a group or independents). */
  const [mergedSubsetIds, setMergedSubsetIds] = useState(null);
  const [gcPopoverOpen, setGcPopoverOpen] = useState(false);
  const [currencyPopoverOpen, setCurrencyPopoverOpen] = useState(false);
  const [popoverActiveGroup, setPopoverActiveGroup] = useState(null);
  const [gcDraftIds, setGcDraftIds] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [currencyCode, setCurrencyCode] = useState("");
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [quickOpen, setQuickOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [pendingStart, setPendingStart] = useState(null);
  const [hoverDate, setHoverDate] = useState(null);
  const [chartVisible, setChartVisible] = useState([true, true, true, true]);
  const [lang, setLang] = useState(() => (localStorage.getItem("login_lang") === "zh" ? "zh" : "en"));

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const defaultStart = formatYmd(new Date(today.getFullYear(), today.getMonth(), 1));
  const defaultEnd = formatYmd(today);
  const [dateFrom, setDateFrom] = useState(defaultStart);
  const [dateTo, setDateTo] = useState(defaultEnd);
  const [calendarYear, setCalendarYear] = useState(today.getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(today.getMonth() + 1);
  const barRef = useRef(null);
  const gcPickRef = useRef(null);
  const currPickRef = useRef(null);
  const calendarGridWheelRef = useRef(null);
  const i18n = useMemo(() => DASHBOARD_I18N[lang] || DASHBOARD_I18N.en, [lang]);

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === "login_lang") {
        setLang(e.newValue === "zh" ? "zh" : "en");
      }
    };
    const onLangUpdated = (e) => {
      const nextLang = e?.detail?.lang;
      setLang(nextLang === "zh" ? "zh" : "en");
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("eazycount:language-updated", onLangUpdated);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("eazycount:language-updated", onLangUpdated);
    };
  }, []);

  useEffect(() => {
    const onOutside = (event) => {
      if (barRef.current && !barRef.current.contains(event.target)) {
        setQuickOpen(false);
        setCalendarOpen(false);
        setPendingStart(null);
        setHoverDate(null);
      }
      if (gcPickRef.current && !gcPickRef.current.contains(event.target)) {
        setGcPopoverOpen(false);
      }
      if (currPickRef.current && !currPickRef.current.contains(event.target)) {
        setCurrencyPopoverOpen(false);
      }
    };
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
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

  const filteredCompanies = useMemo(() => {
    let list = companies.filter((c) => c.company_id && String(c.company_id).trim() !== "");
    if (selectedGroup) {
      list = list.filter((c) => c.group_id && String(c.group_id).toUpperCase() === selectedGroup);
    } else {
      list = list.filter((c) => !c.group_id || String(c.group_id).trim() === "");
    }
    return list;
  }, [companies, selectedGroup]);

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
      setLoadError(j.message || j.error || i18n.couldNotSwitchCompany);
      return false;
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

  const fetchDashboardPayload = async (cid) => {
    const q = new URLSearchParams({
      date_from: dateFrom,
      date_to: dateTo,
      company_id: String(cid),
    });
    if (currencyCode) q.append("currency", currencyCode);
    const res = await fetch(buildApiUrl(`${DASHBOARD_API}?${q}`), { credentials: "include" });
    const json = await res.json();
    if (!res.ok || !json.success || !json.data) {
      throw new Error(json.message || json.error || i18n.dashboardApiError);
    }
    return json.data;
  };

  const loadDashboard = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setLoadError("");
    try {
      if (groupAllMode && selectedGroup) {
        const groupCompanies = companies.filter(
          (c) =>
            c.group_id &&
            String(c.group_id).toUpperCase() === selectedGroup &&
            c.company_id &&
            String(c.company_id).trim() !== ""
        );
        const results = await Promise.all(groupCompanies.map((c) => fetchDashboardPayload(c.id)));
        const merged = mergeGroupData(results, { startDate: dateFrom, endDate: dateTo });
        setDashboardData(merged);
      } else if (mergedSubsetIds && mergedSubsetIds.length > 1) {
        const results = await Promise.all(mergedSubsetIds.map((cid) => fetchDashboardPayload(cid)));
        const merged = mergeGroupData(results, { startDate: dateFrom, endDate: dateTo });
        setDashboardData(merged);
      } else {
        const data = await fetchDashboardPayload(companyId);
        setDashboardData(data);
      }
    } catch (e) {
      setLoadError(e.message || i18n.failedToLoadDashboard);
      setDashboardData(null);
    } finally {
      setLoading(false);
    }
  }, [
    companyId,
    currencyCode,
    dateFrom,
    dateTo,
    groupAllMode,
    selectedGroup,
    mergedSubsetIds,
    companies,
    i18n,
  ]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const kpi = useMemo(() => {
    if (!dashboardData) {
      return {
        profit: 0,
        expenses: 0,
        netProfit: 0,
        earnings: 0,
        showEarnings: false,
      };
    }
    const rawProfit = parseFloat(dashboardData?.period_total?.profit ?? dashboardData.profit) || 0;
    const rawExpenses = parseFloat(dashboardData?.period_total?.expenses ?? dashboardData.expenses) || 0;
    const displayProfitNum = rawProfit;
    const displayExpensesNum = rawExpenses > 0 ? -rawExpenses : rawExpenses;
    const netProfitDisplay = displayProfitNum + displayExpensesNum;
    const ownershipPercentage = parseFloat(dashboardData?.ownership_percentage) || 0;
    const groupEquityPercentage = parseFloat(dashboardData?.group_equity_percentage) || 0;
    const groupAccountPercentage = parseFloat(dashboardData?.group_account_percentage) || 0;
    const hasGroupOwnership = !!dashboardData?.has_group_ownership;
    const effectivePct = hasGroupOwnership
      ? ownershipPercentage / 100 + (groupEquityPercentage / 100) * (groupAccountPercentage / 100)
      : ownershipPercentage / 100;
    const earningsDisplay = netProfitDisplay * effectivePct;
    const showEarnings = !!dashboardData?.has_ownership_setup;
    return {
      profit: displayProfitNum,
      expenses: displayExpensesNum,
      netProfit: netProfitDisplay,
      earnings: earningsDisplay,
      showEarnings,
    };
  }, [dashboardData]);

  const chartRows = useMemo(
    () => (dashboardData ? buildChartRows(dashboardData, dateFrom, dateTo) : []),
    [dashboardData, dateFrom, dateTo]
  );

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

  const groupCompanySummary = useMemo(() => {
    const labelForIds = (ids) =>
      sortIds(ids)
        .map((id) => companies.find((c) => parseInt(c.id, 10) === id)?.company_id)
        .filter(Boolean)
        .join(", ");

    if (!groupIds.length && filteredCompanies.length) {
      if (mergedSubsetIds && mergedSubsetIds.length > 1) return labelForIds(mergedSubsetIds);
      const c = companies.find((co) => parseInt(co.id, 10) === parseInt(companyId, 10));
      return c?.company_id || "—";
    }

    if (!selectedGroup) {
      const c = companies.find((co) => parseInt(co.id, 10) === parseInt(companyId, 10));
      return c?.company_id || "—";
    }

    if (groupAllMode) return `${selectedGroup} · ${i18n.all}`;
    if (mergedSubsetIds && mergedSubsetIds.length > 1) {
      return `${selectedGroup} · ${labelForIds(mergedSubsetIds)}`;
    }
    const c = filteredCompanies.find((co) => parseInt(co.id, 10) === parseInt(companyId, 10));
    return `${selectedGroup} · ${c?.company_id ?? "—"}`;
  }, [
    groupIds.length,
    filteredCompanies,
    mergedSubsetIds,
    companyId,
    companies,
    selectedGroup,
    groupAllMode,
    i18n.all,
  ]);

  const computeGcDraft = useCallback(
    (gid) => {
      const list = companiesInGroupList(companies, gid);
      const allowed = sortIds(list.map((c) => parseInt(c.id, 10)));
      if (!allowed.length) return [];
      if (gid && groupAllMode && gid === selectedGroup) return allowed;
      if (mergedSubsetIds?.length && (gid === selectedGroup || (!gid && !selectedGroup))) {
        const inter = mergedSubsetIds.filter((id) => allowed.includes(id));
        if (inter.length) return sortIds(inter);
      }
      if (companyId && allowed.includes(parseInt(companyId, 10))) {
        return [parseInt(companyId, 10)];
      }
      return [allowed[0]];
    },
    [companies, groupAllMode, mergedSubsetIds, selectedGroup, companyId]
  );

  const openGcPopover = useCallback(() => {
    const g = selectedGroup || (groupIds.length ? groupIds[0] : null);
    setPopoverActiveGroup(g);
    setGcDraftIds(computeGcDraft(g));
    setGcPopoverOpen(true);
  }, [selectedGroup, groupIds, computeGcDraft]);

  const confirmGcPopover = useCallback(async () => {
    const gid = popoverActiveGroup;
    const list = companiesInGroupList(companies, gid);
    const allIds = sortIds(list.map((c) => parseInt(c.id, 10)));
    let picked = sortIds(gcDraftIds.filter((id) => allIds.includes(id)));
    if (!picked.length && allIds.length) picked = [allIds[0]];

    if (gid) {
      setSelectedGroup(gid);
      sessionStorage.setItem("dashboard_group_filter", gid);
    } else {
      setSelectedGroup(null);
      sessionStorage.removeItem("dashboard_group_filter");
    }

    const isAll =
      allIds.length > 0 &&
      picked.length === allIds.length &&
      allIds.every((id, idx) => id === picked[idx]);

    if (picked.length === 1) {
      await switchCompany(picked[0]);
    } else if (gid && isAll) {
      setMergedSubsetIds(null);
      setGroupAllMode(true);
      await switchCompany(picked[0], { clearGroupAll: false, clearSubset: true });
    } else {
      setGroupAllMode(false);
      await switchCompany(picked[0], { clearSubset: false });
      setMergedSubsetIds(picked);
    }

    setGcPopoverOpen(false);
  }, [popoverActiveGroup, companies, gcDraftIds, switchCompany]);

  const toggleGcDraftId = useCallback((id) => {
    setGcDraftIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return sortIds([...next]);
    });
  }, []);

  const selectAllGcDraft = useCallback(() => {
    const list = companiesInGroupList(companies, popoverActiveGroup);
    setGcDraftIds(sortIds(list.map((c) => parseInt(c.id, 10))));
  }, [companies, popoverActiveGroup]);

  const onPopoverPickGroup = useCallback(
    (gid) => {
      setPopoverActiveGroup(gid);
      const list = companiesInGroupList(companies, gid);
      setGcDraftIds(sortIds(list.map((c) => parseInt(c.id, 10))));
    },
    [companies]
  );

  const setPeriodRange = (periodKey) => {
    const r = quickRangeToDates(periodKey);
    if (!r) return;
    setDateFrom(r.startDate);
    setDateTo(r.endDate);
    const d = parseYmd(r.startDate);
    setCalendarYear(d.getFullYear());
    setCalendarMonth(d.getMonth() + 1);
  };

  const onCalendarDayClick = (ymd) => {
    if (!pendingStart) {
      setPendingStart(ymd);
      setDateFrom(ymd);
      setDateTo(ymd);
      return;
    }
    const [from, to] = normalizeRange(pendingStart, ymd);
    setDateFrom(from);
    setDateTo(to);
    setPendingStart(null);
    setHoverDate(null);
    setCalendarOpen(false);
  };

  const previewRange = useMemo(() => {
    if (!pendingStart || !hoverDate) return null;
    const [from, to] = normalizeRange(pendingStart, hoverDate);
    return { from, to };
  }, [pendingStart, hoverDate]);

  const calendarCells = useMemo(
    () => buildCalendarCells(calendarYear, calendarMonth),
    [calendarYear, calendarMonth]
  );

  const periodLabel = useMemo(() => {
    const options = {
      today: i18n.today,
      yesterday: i18n.yesterday,
      thisWeek: i18n.thisWeek,
      lastWeek: i18n.lastWeek,
      thisMonth: i18n.thisMonth,
      lastMonth: i18n.lastMonth,
      thisYear: i18n.thisYear,
      lastYear: i18n.lastYear,
    };
    return options;
  }, [i18n]);

  const yearOptions = useMemo(() => {
    const nowY = new Date().getFullYear();
    return Array.from({ length: nowY - 2021 + 5 }, (_, i) => 2022 + i);
  }, []);

  const gotoPrevMonth = () => {
    if (calendarMonth === 1) {
      setCalendarMonth(12);
      setCalendarYear((y) => y - 1);
      return;
    }
    setCalendarMonth((m) => m - 1);
  };

  const gotoNextMonth = () => {
    if (calendarMonth === 12) {
      setCalendarMonth(1);
      setCalendarYear((y) => y + 1);
      return;
    }
    setCalendarMonth((m) => m + 1);
  };

  useEffect(() => {
    if (!calendarOpen) return;
    const el = calendarGridWheelRef.current;
    if (!el) return;
    const onWheel = (e) => {
      if (e.deltaY === 0) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.deltaY > 0) {
        setCalendarMonth((m) => {
          if (m === 12) {
            setCalendarYear((y) => y + 1);
            return 1;
          }
          return m + 1;
        });
      } else {
        setCalendarMonth((m) => {
          if (m === 1) {
            setCalendarYear((y) => y - 1);
            return 12;
          }
          return m - 1;
        });
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [calendarOpen]);

  const toggleCalendarFromBar = () => {
    setCalendarOpen((v) => !v);
    setQuickOpen(false);
    setPendingStart(null);
    setHoverDate(null);
  };

  return (
    <>
      <div className="dashboard-container">
        <header className="dashboard-page-header">
          <h1 className="dashboard-title">{i18n.transactionDashboard}</h1>
          <div className="dashboard-header-actions">
            <div className="dashboard-date-controls dashboard-date-controls--header">
              <div ref={barRef} className="dashboard-date-range-bar">
                <button
                  type="button"
                  className="btn dashboard-date-range-bar__cal"
                  onClick={toggleCalendarFromBar}
                >
                  <i className="fas fa-calendar-alt" />
                </button>

                <button type="button" className="dashboard-date-range-bar__range" onClick={toggleCalendarFromBar}>
                  {formatDisplayDate(dateFrom)} – {formatDisplayDate(dateTo)}
                </button>

                <div className="dropdown dashboard-date-range-bar__period">
                  <button
                    type="button"
                    className="btn btn-secondary dropdown-toggle dashboard-period-btn"
                    aria-label={i18n.quickPeriod}
                    title={i18n.quickPeriod}
                    onClick={() => {
                      setQuickOpen((o) => !o);
                      setCalendarOpen(false);
                      setPendingStart(null);
                      setHoverDate(null);
                    }}
                  >
                    <i className="fas fa-clock" aria-hidden />
                    <span className="dashboard-period-btn__text">{i18n.period}</span>
                    <i className="fas fa-chevron-down" aria-hidden />
                  </button>
                  {quickOpen && (
                    <div className="dropdown-menu" style={{ display: "block" }} id="quick-select-dropdown">
                      {Object.entries(periodLabel).map(([key, label]) => (
                        <button
                          key={key}
                          type="button"
                          className="dropdown-item"
                          onClick={() => {
                            setPeriodRange(key);
                            setQuickOpen(false);
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {calendarOpen && (
                      <div
                        className="calendar-popup"
                        style={{
                          top: "calc(100% + 6px)",
                          left: 0,
                          right: 0,
                          position: "absolute",
                          boxSizing: "border-box",
                          padding: "10px 12px 12px",
                          borderRadius: 12,
                          border: "1px solid #dbe3ef",
                          background: "#ffffff",
                          boxShadow: "0 12px 30px rgba(15, 23, 42, 0.14)",
                          maxHeight: "none",
                          overflow: "hidden",
                        }}
                      >
                        <div style={{ width: "100%", maxWidth: 320, margin: "0 auto" }}>
                          <div
                            className="calendar-header"
                            style={{
                              marginBottom: 8,
                              padding: "0 2px",
                            }}
                          >
                            <button
                              type="button"
                              className="calendar-nav-btn"
                              onClick={gotoPrevMonth}
                              style={{ borderRadius: 8, width: 24, height: 24 }}
                            >
                              <i className="fas fa-chevron-left" />
                            </button>
                            <div
                              className="calendar-month-year"
                              style={{
                                background: "#f8fafc",
                                border: "1px solid #e2e8f0",
                                borderRadius: 8,
                                padding: "2px 4px",
                                gap: 6,
                              }}
                            >
                              <select
                                value={calendarYear}
                                onChange={(e) => setCalendarYear(Number(e.target.value))}
                                style={{
                                  fontSize: 12,
                                  padding: "4px 6px",
                                  minWidth: 68,
                                  border: "none",
                                  background: "transparent",
                                }}
                              >
                                {yearOptions.map((y) => (
                                  <option key={y} value={y}>
                                    {y}
                                  </option>
                                ))}
                              </select>
                              <select
                                value={calendarMonth}
                                onChange={(e) => setCalendarMonth(Number(e.target.value))}
                                style={{
                                  fontSize: 12,
                                  padding: "4px 6px",
                                  minWidth: 58,
                                  border: "none",
                                  background: "transparent",
                                }}
                              >
                                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                                  <option key={m} value={m}>
                                    {String(m).padStart(2, "0")}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <button
                              type="button"
                              className="calendar-nav-btn"
                              onClick={gotoNextMonth}
                              style={{ borderRadius: 8, width: 24, height: 24 }}
                            >
                              <i className="fas fa-chevron-right" />
                            </button>
                          </div>

                          <div
                            style={{
                              marginBottom: 8,
                              fontWeight: 700,
                              color: "#0f172a",
                              textAlign: "center",
                              fontSize: 26,
                              letterSpacing: "0.2px",
                            }}
                          >
                            {new Date(calendarYear, calendarMonth - 1, 1).toLocaleDateString(i18n.locale, {
                              month: "long",
                              year: "numeric",
                            })}
                          </div>

                          <div ref={calendarGridWheelRef}>
                            <div
                              className="calendar-weekdays"
                              style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 0, marginBottom: 4 }}
                            >
                              {i18n.weekdays.map((w, index) => (
                                <div
                                  key={`${w}-${index}`}
                                  className="calendar-weekday"
                                  style={{ fontSize: 12, fontWeight: 700, color: "#64748b", padding: "3px 0" }}
                                >
                                  {w}
                                </div>
                              ))}
                            </div>

                            <div className="calendar-days" style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 0 }}>
                            {calendarCells.map((cell) => {
                              const isStart = cell.ymd === dateFrom;
                              const isEnd = cell.ymd === dateTo;
                              const inRange = cell.ymd >= dateFrom && cell.ymd <= dateTo;
                              const inPreview =
                                previewRange && cell.ymd >= previewRange.from && cell.ymd <= previewRange.to;
                              const active = isStart || isEnd;
                              const rangeFill = (inRange || inPreview) && !active;
                              return (
                                <button
                                  key={cell.ymd}
                                  type="button"
                                  className={[
                                    "calendar-day",
                                    cell.isToday ? "today" : "",
                                    !cell.inCurrentMonth ? "other-month" : "",
                                    inRange ? "in-range" : "",
                                    isStart ? "start-date" : "",
                                    isEnd ? "end-date" : "",
                                    inPreview ? "preview-range" : "",
                                  ]
                                    .filter(Boolean)
                                    .join(" ")}
                                  onMouseEnter={() => {
                                    if (pendingStart) setHoverDate(cell.ymd);
                                  }}
                                  onMouseLeave={() => {
                                    if (pendingStart) setHoverDate(null);
                                  }}
                                  onClick={() => onCalendarDayClick(cell.ymd)}
                                  style={{
                                    fontSize: 12,
                                    height: 34,
                                    minHeight: 34,
                                    aspectRatio: "auto",
                                    padding: 0,
                                    borderRadius: active ? 8 : 0,
                                    border: active ? "none" : "1px solid transparent",
                                    background: active ? "#3b82f6" : rangeFill ? "#dbeafe" : "transparent",
                                    color: active ? "#ffffff" : !cell.inCurrentMonth ? "#cbd5e1" : "#0f172a",
                                    fontWeight: active ? 700 : 600,
                                  }}
                                >
                                  {cell.day}
                                </button>
                              );
                            })}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
              </div>
            </div>
          </div>
        </header>

        {loadError && (
          <div className="dashboard-card" style={{ marginBottom: 12, color: "#b91c1c" }}>
            {loadError}
          </div>
        )}

        <div id="app" className="dashboard-content">
          <div className="dashboard-card dashboard-filter-panel">
            <div className="dashboard-filter-panel__head">
              <span className="dashboard-filter-panel__title">{i18n.filterSection}</span>
            </div>
            <div className="dashboard-card-body dashboard-filter-panel__body">
              <div className="dashboard-filter-toolbar">
                {(groupIds.length > 0 || filteredCompanies.length > 0) && (
                  <div className="dashboard-filter-trigger-wrap" ref={gcPickRef}>
                    <button type="button" className="dashboard-filter-trigger" onClick={openGcPopover}>
                      <span className="dashboard-filter-trigger__label">{i18n.groupAndCompany}</span>
                      <span className="dashboard-filter-trigger__chips" title={groupCompanySummary}>
                        {groupCompanySummary}
                      </span>
                      <i className="fas fa-chevron-down dashboard-filter-trigger__caret" aria-hidden />
                    </button>

                    {gcPopoverOpen && (
                      <div className="dashboard-filter-popover dashboard-gc-popover" role="dialog">
                        <div className="dashboard-gc-popover__panes">
                          {groupIds.length > 0 && (
                            <div className="dashboard-gc-popover__col dashboard-gc-popover__groups">
                              <div className="dashboard-filter-popover__title">{i18n.selectGroup}</div>
                              <ul className="dashboard-gc-group-list">
                                {groupIds.map((gid) => {
                                  const count = companiesInGroupList(companies, gid).length;
                                  const active = popoverActiveGroup === gid;
                                  return (
                                    <li key={gid}>
                                      <button
                                        type="button"
                                        className={`dashboard-gc-group-item${active ? " is-active" : ""}`}
                                        onClick={() => onPopoverPickGroup(gid)}
                                      >
                                        <span className="dashboard-gc-group-item__dot" aria-hidden />
                                        <span className="dashboard-gc-group-item__label">
                                          {lang === "zh" ? `${gid} 集团` : `${gid} Group`}
                                        </span>
                                        <span className="dashboard-gc-group-item__badge">{count}</span>
                                      </button>
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          )}

                          <div
                            className={`dashboard-gc-popover__col dashboard-gc-popover__companies${
                              groupIds.length === 0 ? " is-full" : ""
                            }`}
                          >
                            <div className="dashboard-filter-popover__title">{i18n.selectCompany}</div>
                            <div className="dashboard-gc-company-pills">
                              {companiesInGroupList(companies, popoverActiveGroup).length > 1 && (
                                <button type="button" className="dashboard-pill dashboard-pill--ghost" onClick={selectAllGcDraft}>
                                  {i18n.all}
                                </button>
                              )}
                              {companiesInGroupList(companies, popoverActiveGroup).map((c) => {
                                const id = parseInt(c.id, 10);
                                const on = gcDraftIds.includes(id);
                                return (
                                  <button
                                    key={c.id}
                                    type="button"
                                    className={`dashboard-pill${on ? " is-on" : ""}`}
                                    onClick={() => toggleGcDraftId(id)}
                                  >
                                    {c.company_id}
                                  </button>
                                );
                              })}
                            </div>
                            <div className="dashboard-gc-popover__footer">
                              <span className="dashboard-gc-popover__count">
                                {i18n.selectedCompaniesCount.replace("{n}", String(gcDraftIds.length))}
                              </span>
                              <button type="button" className="dashboard-filter-confirm-btn" onClick={confirmGcPopover}>
                                {i18n.confirm}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {currencies.length > 0 && (
                  <div className="dashboard-filter-trigger-wrap" ref={currPickRef}>
                    <button
                      type="button"
                      className="dashboard-filter-trigger"
                      onClick={() => setCurrencyPopoverOpen((v) => !v)}
                    >
                      <span className="dashboard-filter-trigger__label">{i18n.currency.replace(":", "")}</span>
                      <span className="dashboard-filter-trigger__chip-mini">{currencyCode}</span>
                      <i className="fas fa-chevron-down dashboard-filter-trigger__caret" aria-hidden />
                    </button>
                    {currencyPopoverOpen && (
                      <div className="dashboard-filter-popover dashboard-currency-popover" role="dialog">
                        <div className="dashboard-filter-popover__title">{i18n.settlementCurrency}</div>
                        <div className="dashboard-currency-grid">
                          {currencies.map((code) => (
                            <button
                              key={code}
                              type="button"
                              className={`dashboard-currency-option${currencyCode === code ? " is-active" : ""}`}
                              onClick={() => {
                                setCurrencyCode(code);
                                setCurrencyPopoverOpen(false);
                              }}
                            >
                              {code}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div
            className={`dashboard-kpi-grid${kpi.showEarnings ? " dashboard-kpi-grid--with-earnings" : ""}`}
          >
            <div className="dashboard-kpi-card dashboard-kpi-card--profit">
              <div className="kpi-icon kpi-icon--boxed kpi-icon--profit">
                <i className="fas fa-dollar-sign" />
              </div>
              <div className="kpi-text">
                <div className="kpi-label">{i18n.profit}</div>
                <div className="kpi-value kpi-value--profit">{loading ? "…" : formatCurrency(kpi.profit)}</div>
                <div className="kpi-footer">{kpiFooter}</div>
              </div>
            </div>
            <div className="dashboard-kpi-card dashboard-kpi-card--expense">
              <div className="kpi-icon kpi-icon--boxed kpi-icon--expense">
                <i className="fas fa-arrow-down" />
              </div>
              <div className="kpi-text">
                <div className="kpi-label">{i18n.expenses}</div>
                <div className="kpi-value kpi-value--expense">{loading ? "…" : formatCurrency(kpi.expenses)}</div>
                <div className="kpi-footer">{kpiFooter}</div>
              </div>
            </div>
            <div
              className={`dashboard-kpi-card dashboard-kpi-card--net${
                kpi.netProfit >= 0 ? " is-positive" : " is-negative"
              }`}
            >
              <div
                className={`kpi-icon kpi-icon--boxed ${kpi.netProfit >= 0 ? "kpi-icon--net-pos" : "kpi-icon--net-neg"}`}
              >
                <i className="fas fa-chart-line" />
              </div>
              <div className="kpi-text">
                <div className="kpi-label">{i18n.netProfit}</div>
                <div
                  className={`kpi-value ${kpi.netProfit >= 0 ? "kpi-value--net-pos" : "kpi-value--net-neg"}`}
                >
                  {loading ? "…" : formatCurrency(kpi.netProfit)}
                </div>
                <div className="kpi-footer">{kpiFooter}</div>
              </div>
            </div>

            {kpi.showEarnings && (
              <div className="dashboard-kpi-card dashboard-kpi-card--earnings" id="earnings-card-wrapper">
                <div className="kpi-icon kpi-icon--boxed kpi-icon--earnings">
                  <i className="fas fa-hand-holding-usd" />
                </div>
                <div className="kpi-text">
                  <div className="kpi-label">{i18n.earnings}</div>
                  <div className="kpi-value kpi-value--earnings" id="earnings-value">
                    {loading ? "…" : formatCurrency(kpi.earnings)}
                  </div>
                  <div className="kpi-footer">{kpiFooter}</div>
                </div>
              </div>
            )}
          </div>

          <div className="dashboard-chart-section">
            <div
              className="dashboard-chart-header"
              style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}
            >
              <div>
                <div className="dashboard-chart-title">{i18n.trendChart}</div>
                <div className="dashboard-date-info" id="chart-date-range">
                  {dashboardData?.date_range
                    ? `${formatDisplayDate(dashboardData.date_range.from)} ${i18n.to} ${formatDisplayDate(
                        dashboardData.date_range.to
                      )}`
                    : `${formatDisplayDate(dateFrom)} ${i18n.to} ${formatDisplayDate(dateTo)}`}
                </div>
              </div>
              <div className="dashboard-chart-buttons" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {[i18n.profit, i18n.expenses, i18n.netProfitChart, i18n.earnings].map((label, i) => {
                  const colors = ["#22c55e", "#ef4444", "#10b981", "#f59e0b"];
                  return (
                    <button
                      key={label}
                      type="button"
                      className={`chart-toggle-btn${chartVisible[i] ? " active" : ""}`}
                      style={{ "--btn-color": colors[i] }}
                      onClick={() =>
                        setChartVisible((v) => {
                          const n = [...v];
                          n[i] = !n[i];
                          return n;
                        })
                      }
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="dashboard-chart-container" style={{ height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartRows} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gProfit" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="rgba(34,197,94,0.35)" />
                      <stop offset="100%" stopColor="rgba(34,197,94,0.02)" />
                    </linearGradient>
                    <linearGradient id="gExp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="rgba(239,68,68,0.35)" />
                      <stop offset="100%" stopColor="rgba(239,68,68,0.02)" />
                    </linearGradient>
                    <linearGradient id="gNet" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="rgba(16,185,129,0.35)" />
                      <stop offset="100%" stopColor="rgba(16,185,129,0.02)" />
                    </linearGradient>
                    <linearGradient id="gEarn" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="rgba(245,158,11,0.35)" />
                      <stop offset="100%" stopColor="rgba(245,158,11,0.02)" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" tickFormatter={(v) => formatCurrency(v)} width={72} />
                  <Tooltip
                    formatter={(value) => formatCurrency(value)}
                    labelFormatter={(_, items) => {
                      const d = items?.[0]?.payload?.date;
                      return d ? formatDisplayDate(d) : "";
                    }}
                  />
                  {chartVisible[0] && (
                    <Area type="monotone" dataKey="profit" name={i18n.profit} stroke="#22c55e" fill="url(#gProfit)" strokeWidth={2} />
                  )}
                  {chartVisible[1] && (
                    <Area type="monotone" dataKey="expenses" name={i18n.expenses} stroke="#ef4444" fill="url(#gExp)" strokeWidth={2} />
                  )}
                  {chartVisible[2] && (
                    <Area type="monotone" dataKey="netProfit" name={i18n.netProfitChart} stroke="#10b981" fill="url(#gNet)" strokeWidth={2} />
                  )}
                  {chartVisible[3] && (
                    <Area type="monotone" dataKey="earnings" name={i18n.earnings} stroke="#f59e0b" fill="url(#gEarn)" strokeWidth={2} />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
