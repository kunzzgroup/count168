import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Customized,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { buildApiUrl } from "../utils/apiUrl.js";
import { notifyCompanySessionUpdated } from "../utils/companySessionEvents.js";
import { mergeGroupData } from "../utils/dashboardMerge.js";
import {
  convertToBaseAmount,
  fetchFrankfurterRates,
  resolveFrankfurterDate,
  sumConvertedEarnings,
} from "../utils/frankfurterRates.js";
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

function chartMonthSpan(startYmd, endYmd) {
  const start = parseYmd(startYmd);
  const end = parseYmd(endYmd);
  if (!start || !end) return 0;
  return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
}

function shouldAggregateChartByMonth(startYmd, endYmd) {
  return chartMonthSpan(startYmd, endYmd) >= 3;
}

function eachMonthInRange(startYmd, endYmd) {
  const start = parseYmd(startYmd);
  const end = parseYmd(endYmd);
  const months = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cur <= endMonth) {
    months.push({ year: cur.getFullYear(), month: cur.getMonth() + 1 });
    cur.setMonth(cur.getMonth() + 1);
  }
  return months;
}

function formatChartMonthLabel(year, month, locale = "en-US") {
  return new Date(year, month - 1, 1).toLocaleDateString(locale, { month: "short", year: "numeric" });
}

function formatChartTooltipLabel(dateKey, locale = "en-US") {
  if (!dateKey) return "";
  if (/^\d{4}-\d{2}$/.test(dateKey)) {
    const [y, m] = dateKey.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString(locale, { month: "long", year: "numeric" });
  }
  return formatDisplayDate(dateKey);
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

/** 按天模式：1 个自然月每天；2 个月隔 2 天；≤14 天每天；更长区间按宽度跳日 */
function resolveDailyChartXAxisTicks(dayCount, monthSpan) {
  if (monthSpan === 1 || dayCount <= 14) {
    return { interval: 0, minTickGap: 0 };
  }
  if (monthSpan === 2) {
    return { interval: 1, minTickGap: 0 };
  }
  return { interval: "preserveStartEnd", minTickGap: 36 };
}

function makeDashboardChartXTick(compact) {
  return function DashboardChartXTick({ x, y, payload }) {
    if (x == null || y == null || payload?.value == null) return null;
    const labelY = y + (compact ? 8 : 10);
    const fontSize = compact ? 10 : 11;
    return (
      <text x={x} y={labelY} fill="#94a3b8" fontSize={fontSize} textAnchor="middle">
        {payload.value}
      </text>
    );
  };
}

function DashboardChartBaseline({ offset, width, height }) {
  if (!height || !width || offset?.bottom == null) return null;
  const axisY = height - offset.bottom;
  return (
    <line
      x1={offset?.left ?? 0}
      y1={axisY}
      x2={width - (offset?.right ?? 0)}
      y2={axisY}
      stroke="#94a3b8"
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

const DASHBOARD_PROFIT_COLOR = "#3b82f6";
const DASHBOARD_EARNINGS_PIE_HEIGHT = 180;
const DASHBOARD_EARNINGS_COLOR = "#f59e0b";
/** 各币种固定色：圆环与右侧列表一致，便于对照 */
const DASHBOARD_CURRENCY_COLORS = {
  MYR: "#2563eb",
  SGD: "#0891b2",
  USD: "#16a34a",
  EUR: "#7c3aed",
  IDR: "#ea580c",
  CNY: "#dc2626",
  HKD: "#db2777",
  THB: "#ca8a04",
  GBP: "#4f46e5",
  JPY: "#be185d",
  AUD: "#0d9488",
  VND: "#c2410c",
  PHP: "#9333ea",
  KRW: "#1d4ed8",
  TWD: "#059669",
  INR: "#0ea5e9",
  BND: "#65a30d",
  CAD: "#0369a1",
  NZD: "#15803d",
};
const DASHBOARD_CURRENCY_FALLBACK_PALETTE = ["#6366f1", "#14b8a6", "#f59e0b", "#64748b", "#a855f7", "#84cc16"];

function getCurrencyColor(code, fallbackIndex = 0) {
  const key = String(code || "").toUpperCase();
  if (DASHBOARD_CURRENCY_COLORS[key]) return DASHBOARD_CURRENCY_COLORS[key];
  return DASHBOARD_CURRENCY_FALLBACK_PALETTE[fallbackIndex % DASHBOARD_CURRENCY_FALLBACK_PALETTE.length];
}

function buildEarningsPieSlices(rows, { useConverted = false } = {}) {
  return rows
    .map((row, index) => {
      const earnings =
        useConverted && row.earningsConverted != null ? row.earningsConverted : row.earnings;
      return {
        code: row.code,
        earnings,
        value: Math.abs(earnings),
        fill: getCurrencyColor(row.code, index),
      };
    })
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value);
}

function formatI18nTemplate(template, vars) {
  return String(template || "").replace(/\{(\w+)\}/g, (_, key) =>
    vars[key] != null ? String(vars[key]) : ""
  );
}

function EarningsPieSectorTooltip({ slice }) {
  if (!slice?.code) return null;
  return (
    <div className="dashboard-summary-pie-tooltip dashboard-summary-pie-tooltip--sector">
      <div className="dashboard-summary-pie-tooltip-label">{slice.code}</div>
      <div className="dashboard-summary-pie-tooltip-value">{formatCurrency(slice.earnings ?? 0)}</div>
    </div>
  );
}

const PIE_RADIAN = Math.PI / 180;

/** Same polar→cartesian mapping as Recharts (startAngle=0, clockwise). */
function polarToCartesian(cx, cy, radius, angleDeg) {
  return {
    x: cx + Math.cos(-PIE_RADIAN * angleDeg) * radius,
    y: cy + Math.sin(-PIE_RADIAN * angleDeg) * radius,
  };
}

/** Anchor tooltip on the outer-arc midpoint using Recharts sector geometry. */
function computeSectorTooltipPosition(sector) {
  const cx = sector?.cx;
  const cy = sector?.cy;
  const outerRadius = sector?.outerRadius;
  const midAngle = sector?.midAngle;
  if (cx == null || cy == null || outerRadius == null || midAngle == null) {
    return null;
  }

  const point = polarToCartesian(cx, cy, outerRadius + 18, midAngle);
  return { left: point.x, top: point.y };
}

function computePieCenterMetrics(slices, selectedCode) {
  const total = (slices || []).reduce((sum, row) => sum + (row.value || 0), 0);
  const selected = String(selectedCode || "").toUpperCase();
  if (total <= 0) {
    return { pct: "0", code: selected || "—" };
  }
  const match = (slices || []).find((row) => String(row.code || "").toUpperCase() === selected);
  const pct = match ? ((match.value / total) * 100).toFixed(0) : "0";
  return { pct, code: selected || match?.code || "—" };
}

function computeCurrencySharePct(row, total, useConverted) {
  const val =
    useConverted && row.earningsConverted != null
      ? Math.abs(row.earningsConverted)
      : Math.abs(parseFloat(row.earnings) || 0);
  if (!total || total <= 0) return 0;
  return (val / total) * 100;
}

const KPI_CARD_ICONS = {
  profit: "fas fa-dollar-sign",
  expense: "fas fa-arrow-trend-down",
  net: "fas fa-chart-line",
  earnings: "fas fa-hand-holding-dollar",
};

function DashboardKpiCard({
  variant,
  label,
  value,
  loading,
  id,
  tone,
  compare,
  compareLabel,
  fallbackFoot,
  footNote,
}) {
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
        {footNote ? <span className="kpi-card-foot-note">{footNote}</span> : null}
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


function buildChartMetricRow(date, label, dailyData, earningsMultiplier) {
  const profitDelta = parseFloat(dailyData.profit?.[date] || 0) || 0;
  const expensesDelta = parseFloat(dailyData.expenses?.[date] || 0) || 0;
  const displayProfit = profitDelta;
  const displayExpenses = expensesDelta > 0 ? -expensesDelta : expensesDelta;
  const netProfit = displayProfit + displayExpenses;
  const earnings = netProfit * earningsMultiplier;
  return {
    date,
    label,
    profit: displayProfit,
    expenses: displayExpenses,
    netProfit,
    earnings,
  };
}

function resolveChartEarningsMultiplier(data) {
  const ownershipPercentage = parseFloat(data?.ownership_percentage) || 0;
  const groupEquityPercentage = parseFloat(data?.group_equity_percentage) || 0;
  const groupAccountPercentage = parseFloat(data?.group_account_percentage) || 0;
  const hasGroupOwnership = !!data?.has_group_ownership;
  const linkMul = parseFloat(data?._link_multiplier || 0) || 0;
  const hasLinkOwnership = linkMul > 0 && linkMul !== 1;
  const directPct = ownershipPercentage / 100;
  if (hasLinkOwnership) {
    const viewerGroupShare = groupAccountPercentage > 0 ? groupAccountPercentage / 100 : 1;
    return linkMul * viewerGroupShare;
  }
  if (directPct > 0) return directPct;
  if (hasGroupOwnership) {
    return (groupEquityPercentage / 100) * (groupAccountPercentage / 100);
  }
  return 0;
}

function buildChartRows(data, startYmd, endYmd, locale = "en-US") {
  if (!data?.daily_data) return [];
  const dailyData = data.daily_data;
  const earningsMultiplier = resolveChartEarningsMultiplier(data);
  const rangeStart = parseYmd(startYmd);
  const rangeEnd = parseYmd(endYmd);

  if (shouldAggregateChartByMonth(startYmd, endYmd)) {
    return eachMonthInRange(startYmd, endYmd).map(({ year, month }) => {
      const monthKey = `${year}-${String(month).padStart(2, "0")}`;
      const lastDay = new Date(year, month, 0).getDate();
      let profitSum = 0;
      let expensesSum = 0;
      for (let day = 1; day <= lastDay; day += 1) {
        const dateStr = `${monthKey}-${String(day).padStart(2, "0")}`;
        const dateObj = parseYmd(dateStr);
        if (dateObj < rangeStart || dateObj > rangeEnd) continue;
        profitSum += parseFloat(dailyData.profit?.[dateStr] || 0) || 0;
        expensesSum += parseFloat(dailyData.expenses?.[dateStr] || 0) || 0;
      }
      const displayProfit = profitSum;
      const displayExpenses = expensesSum > 0 ? -expensesSum : expensesSum;
      const netProfit = displayProfit + displayExpenses;
      const earnings = netProfit * earningsMultiplier;
      return {
        date: monthKey,
        label: formatChartMonthLabel(year, month, locale),
        profit: displayProfit,
        expenses: displayExpenses,
        netProfit,
        earnings,
      };
    });
  }

  const dates = eachDateInRange(startYmd, endYmd);
  const sameCalendarMonth =
    rangeStart &&
    rangeEnd &&
    rangeStart.getFullYear() === rangeEnd.getFullYear() &&
    rangeStart.getMonth() === rangeEnd.getMonth();
  return dates.map((date) => {
    const d = parseYmd(date);
    const label = sameCalendarMonth
      ? String(d.getDate())
      : `${d.getDate()}/${d.getMonth() + 1}`;
    return buildChartMetricRow(date, label, dailyData, earningsMultiplier);
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
  const [earningsByCurrency, setEarningsByCurrency] = useState([]);
  const [earningsByCurrencyLoading, setEarningsByCurrencyLoading] = useState(false);
  const [exchangeRates, setExchangeRates] = useState({ rates: {}, date: null, unsupported: [] });
  const [exchangeRatesLoading, setExchangeRatesLoading] = useState(false);
  const [exchangeRatesError, setExchangeRatesError] = useState("");
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
  const pieWrapRef = useRef(null);
  const [hoveredPieSector, setHoveredPieSector] = useState(null);

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

  const fetchDashboardPayload = useCallback(
    async (cid, rangeFrom, rangeTo, currencyOverride) => {
      const q = new URLSearchParams({
        date_from: rangeFrom,
        date_to: rangeTo,
        company_id: String(cid),
      });
      const cur = currencyOverride ?? currencyCode;
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
    [currencyCode, selectedGroup, companies, i18n]
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
    if (!companyId || !currencies.length) {
      setEarningsByCurrency([]);
      return;
    }
    setEarningsByCurrencyLoading(true);
    try {
      const prevRange = previousPeriodRange(dateFrom, dateTo);
      const rows = await Promise.all(
        currencies.map(async (code) => {
          try {
            const [current, previous] = await Promise.all([
              loadMergedDashboard(dateFrom, dateTo, code),
              loadMergedDashboard(prevRange.from, prevRange.to, code).catch(() => null),
            ]);
            const metrics = computeKpiMetrics(current, selectedGroup);
            const prevMetrics = previous ? computeKpiMetrics(previous, selectedGroup) : null;
            return {
              code,
              earnings: metrics?.earnings ?? 0,
              earningsPrev: prevMetrics?.earnings ?? 0,
            };
          } catch {
            return { code, earnings: 0, earningsPrev: 0 };
          }
        })
      );
      setEarningsByCurrency(rows);
    } finally {
      setEarningsByCurrencyLoading(false);
    }
  }, [companyId, currencies, dateFrom, dateTo, loadMergedDashboard, selectedGroup]);

  useEffect(() => {
    if (!currencyCode || currencies.length <= 1) {
      setExchangeRates({ rates: { [currencyCode]: 1 }, date: null, unsupported: [] });
      setExchangeRatesError("");
      setExchangeRatesLoading(false);
      return undefined;
    }

    let cancelled = false;
    const rateDate = resolveFrankfurterDate(dateTo);

    (async () => {
      setExchangeRatesLoading(true);
      setExchangeRatesError("");
      try {
        const { rates, date, unsupported } = await fetchFrankfurterRates(
          currencyCode,
          currencies,
          rateDate
        );
        if (!cancelled) {
          setExchangeRates({ rates, date, unsupported });
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
    setLoading(true);
    setLoadError("");
    setDashboardDataPrev(null);

    try {
      const prevRange = previousPeriodRange(dateFrom, dateTo);
      const [current, previous] = await Promise.all([
        loadMergedDashboard(dateFrom, dateTo),
        loadMergedDashboard(prevRange.from, prevRange.to).catch(() => null),
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
  }, [companyId, dateFrom, dateTo, loadMergedDashboard, i18n]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

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
          earnings: code === currencyCode ? kpi.earnings : 0,
          earningsPrev: 0,
        }));

    const base = String(currencyCode || "").toUpperCase();
    const rates = exchangeRates.rates || {};
    const canConvert = currencies.length > 1 && !exchangeRatesError && Object.keys(rates).length > 0;

    return baseRows.map((row) => {
      const earningsConverted = canConvert
        ? convertToBaseAmount(row.earnings, row.code, base, rates)
        : null;
      const earningsPrevConverted = canConvert
        ? convertToBaseAmount(row.earningsPrev, row.code, base, rates)
        : null;
      return {
        ...row,
        earningsConverted,
        earningsPrevConverted,
      };
    });
  }, [
    earningsByCurrency,
    currencies,
    currencyCode,
    kpi.earnings,
    exchangeRates.rates,
    exchangeRatesError,
  ]);

  const useConvertedEarnings = useMemo(
    () => currencies.length > 1 && !exchangeRatesError && !exchangeRatesLoading,
    [currencies.length, exchangeRatesError, exchangeRatesLoading]
  );

  const convertedEarningsTotal = useMemo(() => {
    if (!useConvertedEarnings) return null;
    return sumConvertedEarnings(earningsCurrencyRows, currencyCode, exchangeRates.rates).total;
  }, [useConvertedEarnings, earningsCurrencyRows, currencyCode, exchangeRates.rates]);

  const convertedEarningsPrevTotal = useMemo(() => {
    if (!useConvertedEarnings) return null;
    const prevRows = earningsCurrencyRows.map((row) => ({
      code: row.code,
      earnings: row.earningsPrev ?? 0,
    }));
    return sumConvertedEarnings(prevRows, currencyCode, exchangeRates.rates).total;
  }, [useConvertedEarnings, earningsCurrencyRows, currencyCode, exchangeRates.rates]);

  const displayEarningsValue = useMemo(() => {
    if (useConvertedEarnings && convertedEarningsTotal != null) {
      return convertedEarningsTotal;
    }
    return kpi.earnings;
  }, [useConvertedEarnings, convertedEarningsTotal, kpi.earnings]);

  const convertedEarningsCompare = useMemo(() => {
    if (!useConvertedEarnings || convertedEarningsTotal == null || convertedEarningsPrevTotal == null) {
      return kpi.comparisons?.earnings ?? null;
    }
    return buildKpiCompare(convertedEarningsTotal, convertedEarningsPrevTotal);
  }, [
    useConvertedEarnings,
    convertedEarningsTotal,
    convertedEarningsPrevTotal,
    kpi.comparisons?.earnings,
  ]);

  const earningsKpiFootNote = useMemo(() => {
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

  const earningsPieSlices = useMemo(
    () => buildEarningsPieSlices(earningsCurrencyRows, { useConverted: useConvertedEarnings }),
    [earningsCurrencyRows, useConvertedEarnings]
  );

  const earningsShareTotal = useMemo(() => {
    if (useConvertedEarnings && convertedEarningsTotal != null) {
      return Math.abs(convertedEarningsTotal);
    }
    return earningsCurrencyRows.reduce(
      (sum, row) => sum + Math.abs(parseFloat(row.earnings) || 0),
      0
    );
  }, [useConvertedEarnings, convertedEarningsTotal, earningsCurrencyRows]);

  const pieCenterMetrics = useMemo(
    () => computePieCenterMetrics(earningsPieSlices, currencyCode),
    [earningsPieSlices, currencyCode]
  );

  const currencyPieFillByCode = useMemo(() => {
    const map = {};
    earningsCurrencyRows.forEach((row, index) => {
      map[row.code] = getCurrencyColor(row.code, index);
    });
    return map;
  }, [earningsCurrencyRows]);

  const summaryEarningsLoading = loading || earningsByCurrencyLoading || exchangeRatesLoading;

  useEffect(() => {
    setHoveredPieSector(null);
  }, [currencyCode, earningsPieSlices]);

  const handlePieSectorEnter = useCallback((sectorData, index) => {
    const slice = earningsPieSlices[index];
    if (!slice || sectorData?.midAngle == null) return;
    setHoveredPieSector({
      slice,
      cx: sectorData.cx,
      cy: sectorData.cy,
      outerRadius: sectorData.outerRadius,
      midAngle: sectorData.midAngle,
    });
  }, [earningsPieSlices]);

  const hoveredPieTooltip = useMemo(() => {
    if (!hoveredPieSector) return null;
    const pos = computeSectorTooltipPosition(hoveredPieSector);
    if (!pos) return null;
    return { slice: hoveredPieSector.slice, left: pos.left, top: pos.top };
  }, [hoveredPieSector]);

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
                value={formatCurrency(displayEarningsValue)}
                compare={convertedEarningsCompare}
                compareLabel={kpiCompareLabel}
                fallbackFoot={kpiFooter}
                footNote={earningsKpiFootNote}
                loading={loading || earningsByCurrencyLoading || (currencies.length > 1 && exchangeRatesLoading)}
                id="earnings-card-wrapper"
              />
            )}
          </div>

          <div className="dashboard-panels-row">
            <div className="dashboard-panel-card dashboard-panel-card--chart">
              <div className="dashboard-panel-head">
                <h3 className="dashboard-panel-title">{i18n.trendChart}</h3>
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
                        <stop offset="0%" stopColor="rgba(59,130,246,0.35)" />
                        <stop offset="100%" stopColor="rgba(59,130,246,0.02)" />
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
                    <Customized component={DashboardChartBaseline} />
                    <XAxis
                      dataKey="label"
                      interval={chartXAxisLayout.interval}
                      minTickGap={chartXAxisLayout.minTickGap}
                      tick={chartXAxisLayout.tick}
                      height={chartXAxisLayout.height}
                      tickMargin={0}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" tickFormatter={(v) => formatCurrency(v)} width={72} />
                    <Tooltip
                      formatter={(value) => formatCurrency(value)}
                      labelFormatter={(_, items) => {
                        const d = items?.[0]?.payload?.date;
                        return formatChartTooltipLabel(d, i18n.locale);
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
              <div className="dashboard-summary-hero dashboard-summary-hero--compact">
                <span className="dashboard-summary-hero-caption">
                  {i18n.earnings}
                  {currencyCode ? ` · ${currencyCode}` : ""}
                </span>
                <div className="dashboard-summary-hero-value">
                  {summaryEarningsLoading ? "…" : formatCurrency(displayEarningsValue)}
                </div>
              </div>
              <div className="dashboard-summary-earnings-panel">
                <div
                  ref={pieWrapRef}
                  className="dashboard-summary-pie-wrap"
                  aria-hidden={summaryEarningsLoading}
                  onMouseLeave={() => setHoveredPieSector(null)}
                >
                  <ResponsiveContainer width="100%" height={DASHBOARD_EARNINGS_PIE_HEIGHT}>
                    <PieChart margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                      <Pie
                        key={currencyCode || "pie"}
                        data={
                          earningsPieSlices.length
                            ? earningsPieSlices
                            : [{ code: "—", earnings: 0, value: 1, fill: "#e0e7ff" }]
                        }
                        dataKey="value"
                        nameKey="code"
                        cx="50%"
                        cy="50%"
                        innerRadius="58%"
                        outerRadius="78%"
                        paddingAngle={earningsPieSlices.length > 1 ? 2 : 0}
                        stroke="#fff"
                        strokeWidth={2}
                        label={false}
                        activeShape={false}
                        isAnimationActive={!summaryEarningsLoading}
                        animationBegin={0}
                        animationDuration={480}
                        animationEasing="ease-out"
                        onMouseEnter={handlePieSectorEnter}
                        onMouseLeave={() => setHoveredPieSector(null)}
                      >
                        {(earningsPieSlices.length ? earningsPieSlices : [{ fill: "#e0e7ff" }]).map(
                          (entry, index) => (
                            <Cell key={entry.code || index} fill={entry.fill} stroke="#fff" strokeWidth={2} />
                          )
                        )}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  {hoveredPieTooltip && (
                    <div
                      className="dashboard-summary-pie-tooltip-anchor"
                      style={{
                        left: hoveredPieTooltip.left,
                        top: hoveredPieTooltip.top,
                      }}
                    >
                      <EarningsPieSectorTooltip slice={hoveredPieTooltip.slice} />
                    </div>
                  )}
                  {!summaryEarningsLoading && earningsPieSlices.length > 0 && (
                    <div
                      key={currencyCode || "center"}
                      className="dashboard-summary-pie-center"
                      aria-hidden="true"
                    >
                      <div className="dashboard-summary-pie-center-badge">
                        <span className="dashboard-summary-pie-center-pct">{pieCenterMetrics.pct}%</span>
                        <span className="dashboard-summary-pie-center-code">{pieCenterMetrics.code}</span>
                      </div>
                    </div>
                  )}
                </div>
                <div className="dashboard-summary-currency-list" role="list">
                  <div className="dashboard-summary-currency-list-head" aria-hidden="true">
                    <span>{i18n.currencyBreakdown}</span>
                  </div>
                  {earningsCurrencyRows.map((row, index) => {
                    const sharePct = computeCurrencySharePct(
                      row,
                      earningsShareTotal,
                      useConvertedEarnings
                    );
                    return (
                    <div
                      key={row.code}
                      role="listitem"
                      className={`dashboard-summary-currency-row${row.code === currencyCode ? " is-active" : ""}`}
                      style={
                        row.code === currencyCode
                          ? {
                              "--currency-accent":
                                currencyPieFillByCode[row.code] || getCurrencyColor(row.code, index),
                            }
                          : undefined
                      }
                    >
                      <span
                        className="dashboard-summary-currency-dot"
                        style={{
                          backgroundColor: currencyPieFillByCode[row.code] || getCurrencyColor(row.code, index),
                        }}
                        aria-hidden="true"
                      />
                      <span className="dashboard-summary-currency-code">{row.code}</span>
                      <div className="dashboard-summary-currency-amount-col">
                        <span className="dashboard-summary-currency-amount">
                          {summaryEarningsLoading ? "…" : formatCurrency(row.earnings)}
                        </span>
                        {useConvertedEarnings &&
                          row.earningsConverted != null &&
                          String(row.code).toUpperCase() !== String(currencyCode).toUpperCase() && (
                            <span className="dashboard-summary-currency-converted">
                              {formatI18nTemplate(i18n.convertedApprox, {
                                amount: formatCurrency(row.earningsConverted),
                                code: currencyCode,
                              })}
                            </span>
                          )}
                      </div>
                      <span className="dashboard-summary-currency-share">
                        {summaryEarningsLoading ? "" : `${sharePct.toFixed(1)}%`}
                      </span>
                    </div>
                    );
                  })}
                </div>
              </div>
              {currencies.length > 1 && rateFootnoteText && (
                <p
                  className={`dashboard-summary-rate-footnote${
                    exchangeRatesError || exchangeRates.unsupported?.length ? " is-warn" : ""
                  }${exchangeRatesLoading ? " is-muted" : ""}`}
                >
                  {rateFootnoteText}
                </p>
              )}
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
