import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Customized,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { buildApiUrl } from "../utils/apiUrl.js";
import { notifyCompanySessionUpdated } from "../utils/companySessionEvents.js";
import { mergeGroupData } from "../utils/dashboardMerge.js";
import { DASHBOARD_I18N } from "../translateFile/dashboardTranslate.js";
import { formatDmy, parseDdMmYyyyToYmd } from "../utils/dateUtils.js";
import {
  bindMaintenanceCalendarDismissListeners,
  ensureMaintenanceDateRangePicker,
} from "../utils/maintenanceDateRangePicker.js";
import "../../public/css/userlist.css";
import "../../public/css/transaction.css";
import "../../public/css/report-outlined-fields.css";
import "../../public/css/date-range-picker.css";

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

function ymdToDmy(ymd) {
  const d = parseYmd(ymd);
  return d ? formatDmy(d) : "";
}

function formatCurrency(value) {
  return parseFloat(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatSignedChange(value) {
  const n = parseFloat(value) || 0;
  const body = formatCurrency(Math.abs(n));
  if (n > 0) return `+${body}`;
  if (n < 0) return `-${body}`;
  return body;
}

/** X 轴日期贴 SVG 底边；底线与标签同一水平带（Recharts 默认轴线在留白区顶部会悬空） */
function makeDashboardChartXTick(marginBottom, dense) {
  return function DashboardChartXTick({ x, y, payload }) {
    if (x == null || y == null || payload?.value == null) return null;
    const labelY = y + marginBottom - (dense ? 8 : 12);
    if (dense) {
      return (
        <text
          x={x}
          y={labelY}
          fill="#94a3b8"
          fontSize={9}
          textAnchor="end"
          transform={`rotate(-40, ${x}, ${labelY})`}
        >
          {payload.value}
        </text>
      );
    }
    return (
      <text x={x} y={labelY} fill="#94a3b8" fontSize={11} textAnchor="middle">
        {payload.value}
      </text>
    );
  };
}

function DashboardChartBottomAxisLine({ offset, width, height, marginBottom }) {
  if (!height || !width || marginBottom == null) return null;
  const axisY = height - 6;
  return (
    <line
      x1={offset?.left ?? 0}
      y1={axisY}
      x2={width - (offset?.right ?? 0)}
      y2={axisY}
      stroke="#cbd5e1"
      strokeWidth={1}
    />
  );
}

function previousPeriodRange(fromYmd, toYmd) {
  const from = parseYmd(fromYmd);
  const to = parseYmd(toYmd);
  const dayMs = 86400000;
  const dayCount = Math.max(1, Math.round((to - from) / dayMs) + 1);
  const prevTo = new Date(from.getTime() - dayMs);
  const prevFrom = new Date(prevTo.getTime() - (dayCount - 1) * dayMs);
  return { from: formatYmd(prevFrom), to: formatYmd(prevTo) };
}

function isFullCalendarMonth(fromYmd, toYmd) {
  const from = parseYmd(fromYmd);
  const to = parseYmd(toYmd);
  if (from.getDate() !== 1) return false;
  const lastDay = new Date(from.getFullYear(), from.getMonth() + 1, 0).getDate();
  return (
    to.getDate() === lastDay &&
    from.getMonth() === to.getMonth() &&
    from.getFullYear() === to.getFullYear()
  );
}

function kpiPercentChange(current, previous) {
  const c = parseFloat(current) || 0;
  const p = parseFloat(previous) || 0;
  if (p === 0) {
    if (c === 0) return 0;
    return c > 0 ? 100 : -100;
  }
  return ((c - p) / Math.abs(p)) * 100;
}

function buildKpiCompare(current, previous) {
  const delta = (parseFloat(current) || 0) - (parseFloat(previous) || 0);
  return {
    delta,
    pct: kpiPercentChange(current, previous),
    isUp: delta >= 0,
  };
}

function computeKpiMetrics(dashboardData, selectedGroup) {
  if (!dashboardData) return null;
  const rawProfit = parseFloat(dashboardData?.period_total?.profit ?? dashboardData.profit) || 0;
  const rawExpenses = parseFloat(dashboardData?.period_total?.expenses ?? dashboardData.expenses) || 0;
  const displayProfitNum = rawProfit;
  const displayExpensesNum = rawExpenses > 0 ? -rawExpenses : rawExpenses;
  const netProfitDisplay = displayProfitNum + displayExpensesNum;
  const ownershipPercentage = parseFloat(dashboardData?.ownership_percentage) || 0;
  const groupEquityPercentage = parseFloat(dashboardData?.group_equity_percentage) || 0;
  const groupAccountPercentage = parseFloat(dashboardData?.group_account_percentage) || 0;
  const hasGroupOwnership = !!dashboardData?.has_group_ownership;
  const linkMul = parseFloat(dashboardData?._link_multiplier || 0) || 0;
  const hasLinkOwnership = linkMul > 0 && linkMul !== 1;
  const inGroupView = !!selectedGroup;
  const directPct = ownershipPercentage / 100;
  let effectivePct;
  if (hasLinkOwnership) {
    const viewerGroupShare = groupAccountPercentage > 0 ? groupAccountPercentage / 100 : 1;
    effectivePct = linkMul * viewerGroupShare;
  } else if (directPct > 0) {
    effectivePct = directPct;
  } else if (hasGroupOwnership) {
    effectivePct = (groupEquityPercentage / 100) * (groupAccountPercentage / 100);
  } else {
    effectivePct = directPct === 0 && inGroupView ? 1 : 0;
  }
  const earningsDisplay = netProfitDisplay * effectivePct;
  const showEarnings = !!dashboardData?.has_ownership_setup || hasLinkOwnership || inGroupView;
  return {
    profit: displayProfitNum,
    expenses: displayExpensesNum,
    netProfit: netProfitDisplay,
    earnings: earningsDisplay,
    showEarnings,
  };
}

const KPI_CARD_ICONS = {
  profit: "fas fa-dollar-sign",
  expense: "fas fa-arrow-trend-down",
  net: "fas fa-chart-line",
  earnings: "fas fa-hand-holding-dollar",
};

function DashboardKpiCard({ variant, label, value, loading, id, tone, compare, compareLabel, fallbackFoot }) {
  const showCompare = compare && !loading;
  const badgeUp = compare?.pct >= 0;
  const deltaUp = compare?.isUp;

  return (
    <div
      id={id}
      className={`dashboard-kpi-card dashboard-kpi-card--${variant}${tone ? ` dashboard-kpi-card--${tone}` : ""}`}
    >
      <div className="kpi-card-head">
        <i className={`kpi-card-head-icon ${KPI_CARD_ICONS[variant] || "far fa-chart-bar"}`} aria-hidden="true" />
        <span className="kpi-card-head-label">{label}</span>
      </div>
      <div className="kpi-card-main">
        <div className="kpi-card-value">{loading ? "…" : value}</div>
        {showCompare && (
          <span className={`kpi-card-badge${badgeUp ? " is-up" : " is-down"}`}>
            <i className={`fas fa-arrow-${badgeUp ? "up" : "down"}`} aria-hidden="true" />
            {Math.abs(compare.pct).toFixed(1)}%
          </span>
        )}
      </div>
      <div className="kpi-card-foot">
        {showCompare ? (
          <>
            <span className={`kpi-card-delta${deltaUp ? " is-up" : " is-down"}`}>
              {formatSignedChange(compare.delta)}
            </span>
            <span className="kpi-card-foot-muted">{compareLabel}</span>
          </>
        ) : (
          <span className="kpi-card-foot-muted">{fallbackFoot}</span>
        )}
      </div>
    </div>
  );
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
  const linkMul = parseFloat(data?._link_multiplier || 0) || 0;
  const hasLinkOwnership = linkMul > 0 && linkMul !== 1;
  const directPct = ownershipPercentage / 100;
  let earningsMultiplier;
  if (hasLinkOwnership) {
    const viewerGroupShare = groupAccountPercentage > 0 ? groupAccountPercentage / 100 : 1;
    earningsMultiplier = linkMul * viewerGroupShare;
  } else if (directPct > 0) {
    earningsMultiplier = directPct;
  } else if (hasGroupOwnership) {
    earningsMultiplier = (groupEquityPercentage / 100) * (groupAccountPercentage / 100);
  } else {
    earningsMultiplier = 0;
  }

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
  const [currencies, setCurrencies] = useState([]);
  const [currencyCode, setCurrencyCode] = useState("");
  const [dashboardData, setDashboardData] = useState(null);
  const [dashboardDataPrev, setDashboardDataPrev] = useState(null);
  const [loading, setLoading] = useState(true);
  const [chartVisible, setChartVisible] = useState([true, true, true, true]);
  const [lang, setLang] = useState(() => (localStorage.getItem("login_lang") === "zh" ? "zh" : "en"));
  const [companyAccessModal, setCompanyAccessModal] = useState({ open: false, message: "" });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const defaultStart = formatYmd(new Date(today.getFullYear(), today.getMonth(), 1));
  const defaultEnd = formatYmd(today);
  const [dateFrom, setDateFrom] = useState(defaultStart);
  const [dateTo, setDateTo] = useState(defaultEnd);
  const i18n = useMemo(() => DASHBOARD_I18N[lang] || DASHBOARD_I18N.en, [lang]);
  const dashDatePickerReadyRef = useRef(false);

  const effectiveDateRangeText = useMemo(
    () => `${ymdToDmy(dateFrom)} - ${ymdToDmy(dateTo)}`,
    [dateFrom, dateTo]
  );

  const periodPresets = useMemo(
    () => [
      ["today", i18n.today],
      ["yesterday", i18n.yesterday],
      ["thisWeek", i18n.thisWeek],
      ["lastWeek", i18n.lastWeek],
      ["thisMonth", i18n.thisMonth],
      ["lastMonth", i18n.lastMonth],
      ["thisYear", i18n.thisYear],
      ["lastYear", i18n.lastYear],
    ],
    [i18n]
  );

  /* useLayoutEffect: passive cleanup from other routes must not run after child mount and strip transaction-page (React #310 / SPA nav flash). */
  useLayoutEffect(() => {
    document.body.classList.add("transaction-page");
    return () => document.body.classList.remove("transaction-page");
  }, []);

  useEffect(() => {
    bindMaintenanceCalendarDismissListeners();
  }, []);

  useEffect(() => {
    window.MaintenanceDateRangePicker?.setLocaleStrings?.({
      placeholder: i18n.selectDateRange,
      selectEndDateHint: i18n.selectEndDate,
      monthLabels: i18n.monthLabels,
    });
  }, [i18n]);

  useEffect(() => {
    const df = document.getElementById("date_from");
    const dt = document.getElementById("date_to");
    if (!df || !dt) return;
    const f = ymdToDmy(dateFrom);
    const t = ymdToDmy(dateTo);
    if (df.value !== f) df.value = f;
    if (dt.value !== t) dt.value = t;
    window.MaintenanceDateRangePicker?.refreshInputsDisplay?.();
  }, [dateFrom, dateTo]);

  useEffect(() => {
    if (!me) return undefined;
    let cancelled = false;
    ensureMaintenanceDateRangePicker();
    const initPicker = () => {
      if (cancelled || dashDatePickerReadyRef.current) return;
      if (!window.MaintenanceDateRangePicker?.init) return;
      if (!document.getElementById("calendar-popup")) return;
      window.MaintenanceDateRangePicker.init({
        allowEmpty: false,
        placeholder: i18n.selectDateRange,
        selectEndDateHint: i18n.selectEndDate,
        onChange: () => {
          const fromDmy =
            window.MaintenanceDateRangePicker.getDateFrom?.() ||
            document.getElementById("date_from")?.value ||
            "";
          const toDmy =
            window.MaintenanceDateRangePicker.getDateTo?.() ||
            document.getElementById("date_to")?.value ||
            "";
          const from = parseDdMmYyyyToYmd(fromDmy);
          const to = parseDdMmYyyyToYmd(toDmy);
          if (from && to) {
            setDateFrom(from);
            setDateTo(to);
          }
        },
      });
      dashDatePickerReadyRef.current = true;
      window.MaintenanceDateRangePicker?.refreshInputsDisplay?.();
    };
    initPicker();
    return () => {
      cancelled = true;
      dashDatePickerReadyRef.current = false;
    };
  }, [me, i18n.selectDateRange, i18n.selectEndDate]);

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

  const fetchDashboardPayload = async (cid, rangeFrom = dateFrom, rangeTo = dateTo) => {
    const q = new URLSearchParams({
      date_from: rangeFrom,
      date_to: rangeTo,
      company_id: String(cid),
    });
    if (currencyCode) q.append("currency", currencyCode);
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
  };

  const loadDashboard = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setLoadError("");
    setDashboardDataPrev(null);

    const loadMerged = async (rangeFrom, rangeTo) => {
      if (groupAllMode && selectedGroup) {
        const groupCompanies = companies.filter(
          (c) =>
            c.group_id &&
            String(c.group_id).toUpperCase() === selectedGroup &&
            c.company_id &&
            String(c.company_id).trim() !== ""
        );
        const results = await Promise.all(groupCompanies.map((c) => fetchDashboardPayload(c.id, rangeFrom, rangeTo)));
        return mergeGroupData(results, { startDate: rangeFrom, endDate: rangeTo });
      }
      if (mergedSubsetIds && mergedSubsetIds.length > 1) {
        const results = await Promise.all(mergedSubsetIds.map((cid) => fetchDashboardPayload(cid, rangeFrom, rangeTo)));
        return mergeGroupData(results, { startDate: rangeFrom, endDate: rangeTo });
      }
      return fetchDashboardPayload(companyId, rangeFrom, rangeTo);
    };

    try {
      const prevRange = previousPeriodRange(dateFrom, dateTo);
      const [current, previous] = await Promise.all([
        loadMerged(dateFrom, dateTo),
        loadMerged(prevRange.from, prevRange.to).catch(() => null),
      ]);
      setDashboardData(current);
      setDashboardDataPrev(previous);
    } catch (e) {
      setLoadError(e.message || i18n.failedToLoadDashboard);
      setDashboardData(null);
      setDashboardDataPrev(null);
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

  const chartRows = useMemo(
    () => (dashboardData ? buildChartRows(dashboardData, dateFrom, dateTo) : []),
    [dashboardData, dateFrom, dateTo]
  );

  const chartXAxisLayout = useMemo(() => {
    const n = chartRows.length;
    const dense = n > 14;
    const marginBottom = dense ? 34 : 20;
    return {
      interval: n <= 45 ? 0 : "preserveStartEnd",
      minTickGap: n <= 45 ? 0 : 8,
      tick: makeDashboardChartXTick(marginBottom, dense),
      height: marginBottom,
      marginBottom,
      dense,
    };
  }, [chartRows.length]);

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
      { idx: 0, label: i18n.profit, color: "#22c55e", dataKey: "profit", fill: "url(#gProfit)" },
      { idx: 1, label: i18n.expenses, color: "#ef4444", dataKey: "expenses", fill: "url(#gExp)" },
      { idx: 2, label: i18n.netProfitChart, color: "#10b981", dataKey: "netProfit", fill: "url(#gNet)" },
    ];
    if (kpi.showEarnings) {
      series.push({ idx: 3, label: i18n.earnings, color: "#f59e0b", dataKey: "earnings", fill: "url(#gEarn)" });
    }
    return series;
  }, [i18n, kpi.showEarnings]);

  const summaryBreakdownBars = useMemo(() => {
    const rows = [
      { label: i18n.profit, value: Math.abs(kpi.profit || 0), color: "#22c55e" },
      { label: i18n.expenses, value: Math.abs(kpi.expenses || 0), color: "#ef4444" },
      { label: i18n.netProfitChart, value: Math.abs(kpi.netProfit || 0), color: "#10b981" },
    ];
    if (kpi.showEarnings) {
      rows.push({ label: i18n.earnings, value: Math.abs(kpi.earnings || 0), color: "#f59e0b" });
    }
    const max = Math.max(...rows.map((r) => r.value), 1);
    return rows.map((r) => ({ ...r, pct: Math.min(100, (r.value / max) * 100) }));
  }, [i18n, kpi]);

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
    [companies, selectedGroup, switchCompany]
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
    [companyId, selectedGroup, groupAllMode, mergedSubsetIds, switchCompany]
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
  }, [selectedGroup, companies, handlePickCompany, switchCompany]);

  return (
    <>
      <div className="dashboard-container">
        {companyAccessModal.open && (
          <div className="dashboard-alert-modal-overlay" aria-hidden="false">
            <div className="dashboard-alert-modal-box" role="dialog" aria-labelledby="dashboardAlertModalTitle">
              <div className="dashboard-alert-modal-icon-wrap">
                <i className="fas fa-exclamation-triangle dashboard-alert-modal-icon" aria-hidden="true" />
              </div>
              <h3 id="dashboardAlertModalTitle" className="dashboard-alert-modal-title">Notice</h3>
              <p className="dashboard-alert-modal-message">{companyAccessModal.message}</p>
              <div className="dashboard-alert-modal-actions">
                <button
                  type="button"
                  className="dashboard-alert-modal-btn dashboard-alert-modal-btn-primary"
                  onClick={() => setCompanyAccessModal({ open: false, message: "" })}
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        )}
        <header className="dashboard-page-header">
          <h1 className="dashboard-title">{i18n.transactionDashboard}</h1>
        </header>

        {loadError && (
          <div className="dashboard-card" style={{ marginBottom: 12, color: "#b91c1c" }}>
            {loadError}
          </div>
        )}

        <div id="app" className="dashboard-content">
          <div className="dashboard-card dashboard-filter-panel action-buttons-container">
            <div className="dashboard-filter-date-row">
              <span className="user-gc-inline-label">{i18n.dateRange}</span>
              <div className="dashboard-filter-date-field report-outlined-anchor transaction-outlined-field-col transaction-outlined-field-col--date">
                <div className="report-outlined-shell report-outlined-shell--no-label">
                  <div className="report-outlined-inner">
                    <div className="transaction-date-range-group">
                      <div
                        className="date-range-picker"
                        id="date-range-picker"
                        role="button"
                        tabIndex={0}
                        aria-label={i18n.selectDateRange}
                      >
                        <i className="fas fa-calendar-alt" />
                        <span id="date-range-display">{effectiveDateRangeText}</span>
                        <i className="fas fa-chevron-down transaction-date-range-chevron" aria-hidden="true" />
                      </div>
                      <input type="hidden" id="date_from" readOnly />
                      <input type="hidden" id="date_to" readOnly />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {(groupIds.length > 0 || companiesForPicker.length > 0 || currencies.length > 0) && (
              <div className="user-gc-inline-panel">
                {groupIds.length > 0 && (
                    <div className="user-gc-inline-row">
                      <span className="user-gc-inline-label">{i18n.groupId}</span>
                      <div className="user-gc-inline-pills user-gc-inline-pills--segment-scroll">
                        <div className="user-gc-segment-group" role="group" aria-label={i18n.groupId}>
                          {groupIds.map((gid) => (
                            <button
                              key={gid}
                              type="button"
                              className={`user-gc-segment${selectedGroup === gid && !groupAllMode ? " is-on" : ""}`}
                              onClick={() => void handlePickGroup(gid)}
                            >
                              {gid}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                  {companiesForPicker.length > 0 && (
                    <div className="user-gc-inline-row">
                      <span className="user-gc-inline-label">{i18n.company}</span>
                      <div className="user-gc-inline-pills user-gc-inline-pills--segment-scroll">
                        <div className="user-gc-segment-group" role="group" aria-label={i18n.company}>
                          {selectedGroup && companiesForPicker.length > 1 && (
                            <button
                              type="button"
                              className={`user-gc-segment${groupAllMode ? " is-on" : ""}`}
                              onClick={() => void handlePickAllInGroup()}
                            >
                              {i18n.all}
                            </button>
                          )}
                          {companiesForPicker.map((c) => {
                            const id = parseInt(c.id, 10);
                            const active = groupAllMode
                              ? false
                              : mergedSubsetIds && mergedSubsetIds.length > 1
                                ? mergedSubsetIds.includes(id)
                                : parseInt(companyId, 10) === id;
                            return (
                              <button
                                key={c.id}
                                type="button"
                                className={`user-gc-segment${active ? " is-on" : ""}`}
                                onClick={() => void handlePickCompany(c)}
                              >
                                {String(c.company_id || "").toUpperCase()}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                  {currencies.length > 0 && (
                    <div className="user-gc-inline-row">
                      <span className="user-gc-inline-label">{i18n.currency}</span>
                      <div className="user-gc-inline-pills user-gc-inline-pills--segment-scroll">
                        <div className="user-gc-segment-group" role="group" aria-label={i18n.currency}>
                          {currencies.map((code) => (
                            <button
                              key={code}
                              type="button"
                              className={`user-gc-segment${currencyCode === code ? " is-on" : ""}`}
                              onClick={() => setCurrencyCode(code)}
                            >
                              {code}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                )}
              </div>
            )}
          </div>

          <div
            className={`dashboard-kpi-grid${kpi.showEarnings ? " dashboard-kpi-grid--with-earnings" : ""}`}
          >
            <DashboardKpiCard
              variant="profit"
              label={i18n.profit}
              value={formatCurrency(kpi.profit)}
              compare={kpi.comparisons?.profit}
              compareLabel={kpiCompareLabel}
              fallbackFoot={kpiFooter}
              loading={loading}
            />
            <DashboardKpiCard
              variant="expense"
              label={i18n.expenses}
              value={formatCurrency(kpi.expenses)}
              compare={kpi.comparisons?.expenses}
              compareLabel={kpiCompareLabel}
              fallbackFoot={kpiFooter}
              loading={loading}
            />
            <DashboardKpiCard
              variant="net"
              label={i18n.netProfit}
              value={formatCurrency(kpi.netProfit)}
              compare={kpi.comparisons?.netProfit}
              compareLabel={kpiCompareLabel}
              fallbackFoot={kpiFooter}
              loading={loading}
              tone={kpi.netProfit >= 0 ? "positive" : "negative"}
            />
            {kpi.showEarnings && (
              <DashboardKpiCard
                variant="earnings"
                label={i18n.earnings}
                value={formatCurrency(kpi.earnings)}
                compare={kpi.comparisons?.earnings}
                compareLabel={kpiCompareLabel}
                fallbackFoot={kpiFooter}
                loading={loading}
                id="earnings-card-wrapper"
              />
            )}
          </div>

          <div className="dashboard-panels-row">
            <div className="dashboard-panel-card dashboard-panel-card--chart">
              <div className="dashboard-panel-head">
                <h3 className="dashboard-panel-title">{i18n.statistics}</h3>
                <div className="dashboard-panel-legend" role="group" aria-label={i18n.trendChart}>
                  {chartSeries.map((s) => (
                    <button
                      key={s.dataKey}
                      type="button"
                      className={`dashboard-legend-item${chartVisible[s.idx] ? " is-on" : ""}`}
                      aria-pressed={chartVisible[s.idx]}
                      onClick={() =>
                        setChartVisible((v) => {
                          const n = [...v];
                          n[s.idx] = !n[s.idx];
                          return n;
                        })
                      }
                    >
                      <span className="dashboard-legend-dot" style={{ backgroundColor: s.color }} aria-hidden="true" />
                      <span>{s.label}</span>
                    </button>
                  ))}
                </div>
                <div className="dashboard-panel-period-pill" id="chart-date-range">
                  {chartDateRangeText}
                </div>
              </div>
              <div className="dashboard-panel-chart-body">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={chartRows}
                    margin={{ top: 8, right: 16, left: 0, bottom: chartXAxisLayout.marginBottom }}
                  >
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
                    <Customized
                      component={(props) => (
                        <DashboardChartBottomAxisLine
                          {...props}
                          marginBottom={chartXAxisLayout.marginBottom}
                        />
                      )}
                    />
                    <XAxis
                      dataKey="label"
                      interval={chartXAxisLayout.interval}
                      minTickGap={chartXAxisLayout.minTickGap}
                      tick={chartXAxisLayout.tick}
                      height={chartXAxisLayout.height}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" tickFormatter={(v) => formatCurrency(v)} width={72} />
                    <Tooltip
                      formatter={(value) => formatCurrency(value)}
                      labelFormatter={(_, items) => {
                        const d = items?.[0]?.payload?.date;
                        return d ? formatDisplayDate(d) : "";
                      }}
                    />
                    {chartSeries.map(
                      (s) =>
                        chartVisible[s.idx] && (
                          <Area
                            key={s.dataKey}
                            type="monotone"
                            dataKey={s.dataKey}
                            name={s.label}
                            stroke={s.color}
                            fill={s.fill}
                            strokeWidth={2}
                          />
                        )
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="dashboard-panel-card dashboard-panel-card--summary">
              <div className="dashboard-summary-head">
                <span className="dashboard-summary-label">{i18n.periodSummary}</span>
                <span className="dashboard-summary-foot-muted">{kpiFooter}</span>
              </div>
              <div className="dashboard-summary-hero">
                <div className="dashboard-summary-hero-value">{loading ? "…" : formatCurrency(kpi.netProfit)}</div>
                {!loading && kpi.comparisons?.netProfit && (
                  <span
                    className={`kpi-card-badge${kpi.comparisons.netProfit.pct >= 0 ? " is-up" : " is-down"}`}
                  >
                    <i
                      className={`fas fa-arrow-${kpi.comparisons.netProfit.pct >= 0 ? "up" : "down"}`}
                      aria-hidden="true"
                    />
                    {Math.abs(kpi.comparisons.netProfit.pct).toFixed(1)}%
                  </span>
                )}
              </div>
              {!loading && kpi.comparisons?.netProfit && (
                <div className="dashboard-summary-compare">
                  <span
                    className={`kpi-card-delta${kpi.comparisons.netProfit.isUp ? " is-up" : " is-down"}`}
                  >
                    {formatSignedChange(kpi.comparisons.netProfit.delta)}
                  </span>
                  <span className="kpi-card-foot-muted">{kpiCompareLabel}</span>
                </div>
              )}
              <div className="dashboard-summary-bars">
                {summaryBreakdownBars.map((row) => (
                  <div key={row.label} className="dashboard-summary-bar-row">
                    <div className="dashboard-summary-bar-meta">
                      <span className="dashboard-summary-bar-label">{row.label}</span>
                      <span className="dashboard-summary-bar-value">{formatCurrency(row.value)}</span>
                    </div>
                    <div className="dashboard-summary-bar-track">
                      <div
                        className="dashboard-summary-bar-fill"
                        style={{ width: `${row.pct}%`, backgroundColor: row.color }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="calendar-popup calendar-popup--transaction-range" id="calendar-popup" style={{ display: "none" }}>
        <div className="transaction-calendar-presets" aria-label={i18n.periodShortcutsAria}>
          {periodPresets.map(([key, label]) => (
            <button
              key={key}
              type="button"
              className="transaction-calendar-preset"
              data-period-key={key}
              aria-pressed="false"
              onClick={(e) => {
                e.stopPropagation();
                window.selectQuickRange?.(key);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="transaction-calendar-panel">
          <div className="calendar-header">
            <button
              type="button"
              className="calendar-nav-btn"
              onClick={(e) => {
                e.stopPropagation();
                window.changeMonth?.(-1);
              }}
            >
              <i className="fas fa-chevron-left" />
            </button>
            <div className="calendar-month-year" onClick={(e) => e.stopPropagation()} role="presentation">
              <button type="button" id="calendar-month-select" className="calendar-month-trigger" aria-label="Month">
                {i18n.monthLabels[parseYmd(dateFrom)?.getMonth() ?? new Date().getMonth()]}
              </button>
              <button type="button" id="calendar-year-select" className="calendar-year-trigger" aria-label="Year">
                {parseYmd(dateFrom)?.getFullYear() ?? new Date().getFullYear()}
              </button>
            </div>
            <button
              type="button"
              className="calendar-nav-btn"
              onClick={(e) => {
                e.stopPropagation();
                window.changeMonth?.(1);
              }}
            >
              <i className="fas fa-chevron-right" />
            </button>
          </div>
          <div className="calendar-weekdays">
            {i18n.weekdaysShort.map((d) => (
              <div key={d} className="calendar-weekday">
                {d}
              </div>
            ))}
          </div>
          <div className="calendar-days" id="calendar-days" />
        </div>
      </div>
    </>
  );
}
