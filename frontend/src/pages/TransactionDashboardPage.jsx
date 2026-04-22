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
import { mergeGroupData } from "../utils/dashboardMerge.js";

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

function monthLabel(year, month) {
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
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
  const [currencies, setCurrencies] = useState([]);
  const [currencyCode, setCurrencyCode] = useState("");
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [quickOpen, setQuickOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [pendingStart, setPendingStart] = useState(null);
  const [hoverDate, setHoverDate] = useState(null);
  const [chartVisible, setChartVisible] = useState([true, true, true, true]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const defaultStart = formatYmd(new Date(today.getFullYear(), today.getMonth(), 1));
  const defaultEnd = formatYmd(today);
  const [dateFrom, setDateFrom] = useState(defaultStart);
  const [dateTo, setDateTo] = useState(defaultEnd);
  const [calendarYear, setCalendarYear] = useState(today.getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(today.getMonth() + 1);
  const barRef = useRef(null);

  useEffect(() => {
    document.body.classList.remove("bg");
    document.body.classList.add("dashboard-page");
    return () => {
      document.body.classList.remove("dashboard-page");
      document.body.classList.add("bg");
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
        window.location.assign(new URL("member.php", window.location.origin).href);
        return;
      }
      if (u.needs_owner_secondary) {
        window.location.assign(new URL("owner_secondary_password.php", window.location.origin).href);
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

  const switchCompany = async (id) => {
    const res = await fetch(buildApiUrl(`api/session/update_company_session_api.php?company_id=${id}`), {
      credentials: "include",
    });
    const j = await res.json();
    if (!res.ok || !j.success) {
      setLoadError(j.message || j.error || "Could not switch company");
      return false;
    }
    setCompanyId(parseInt(id, 10));
    setGroupAllMode(false);
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
      throw new Error(json.message || json.error || "Dashboard API error");
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
      } else {
        const data = await fetchDashboardPayload(companyId);
        setDashboardData(data);
      }
    } catch (e) {
      setLoadError(e.message || "Failed to load dashboard");
      setDashboardData(null);
    } finally {
      setLoading(false);
    }
  }, [companyId, currencyCode, dateFrom, dateTo, groupAllMode, selectedGroup, companies]);

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


  const onGroupClick = async (gid) => {
    if (selectedGroup === gid) {
      setSelectedGroup(null);
      sessionStorage.removeItem("dashboard_group_filter");
      setGroupAllMode(false);
      const independent = companies.filter((c) => !c.group_id || String(c.group_id).trim() === "");
      if (independent[0]) await switchCompany(independent[0].id);
      return;
    }
    setSelectedGroup(gid);
    sessionStorage.setItem("dashboard_group_filter", gid);
    setGroupAllMode(false);
    const groupCompanies = companies.filter(
      (c) => c.group_id && String(c.group_id).toUpperCase() === gid && c.company_id?.trim()
    );
    if (groupCompanies[0] && parseInt(groupCompanies[0].id, 10) !== parseInt(companyId, 10)) {
      await switchCompany(groupCompanies[0].id);
    }
  };

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
      today: "Today",
      yesterday: "Yesterday",
      thisWeek: "This Week",
      lastWeek: "Last Week",
      thisMonth: "This Month",
      lastMonth: "Last Month",
      thisYear: "This Year",
      lastYear: "Last Year",
    };
    return options;
  }, []);

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

  const toggleCalendarFromBar = () => {
    setCalendarOpen((v) => !v);
    setQuickOpen(false);
    setPendingStart(null);
    setHoverDate(null);
  };

  return (
    <>
      <div className="dashboard-container">
        <h1 className="dashboard-title">Transaction Dashboard</h1>

        {loadError && (
          <div className="dashboard-card" style={{ marginBottom: 12, color: "#b91c1c" }}>
            {loadError}
          </div>
        )}

        <div id="app" className="dashboard-content">
          <div className={`dashboard-top-row${kpi.showEarnings ? " has-earnings" : ""}`}>
            <div className="dashboard-card dashboard-card--filters">
              <div className="dashboard-card-body">
                <div className="dashboard-date-controls">
                  <div
                    ref={barRef}
                    style={{
                      width: "min(100%, 430px)",
                      display: "grid",
                      gridTemplateColumns: "auto 1fr auto",
                      alignItems: "center",
                      gap: 8,
                      border: "1px solid #d1d5db",
                      borderRadius: 8,
                      padding: "6px 8px",
                      position: "relative",
                      background: "#fff",
                    }}
                  >
                    <button
                      type="button"
                      className="btn"
                      style={{
                        background: "#eff6ff",
                        color: "#2563eb",
                        border: "1px solid #bfdbfe",
                        borderRadius: 6,
                        minHeight: 30,
                        padding: "4px 10px",
                        fontSize: 12,
                      }}
                      onClick={toggleCalendarFromBar}
                    >
                      <i className="fas fa-calendar-alt" />
                    </button>

                    <button
                      type="button"
                      onClick={toggleCalendarFromBar}
                      style={{
                        textAlign: "center",
                        fontWeight: 600,
                        color: "#1f2937",
                        fontSize: 13,
                        lineHeight: 1.25,
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        padding: 0,
                      }}
                    >
                      {formatDisplayDate(dateFrom)} - {formatDisplayDate(dateTo)}
                    </button>

                    <div className="dropdown" style={{ width: 140 }}>
                      <button
                        type="button"
                        className="btn btn-secondary dropdown-toggle"
                        style={{ minHeight: 30, padding: "4px 10px", fontSize: 12 }}
                        onClick={() => {
                          setQuickOpen((o) => !o);
                          setCalendarOpen(false);
                          setPendingStart(null);
                          setHoverDate(null);
                        }}
                      >
                        <i className="fas fa-clock" />
                        <span id="quick-select-text">Period</span>
                        <i className="fas fa-chevron-down" />
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
                        style={{ top: "calc(100% + 2px)", left: 0, right: "auto", position: "absolute" }}
                      >
                        <div className="calendar-header">
                          <button type="button" className="calendar-nav-btn" onClick={gotoPrevMonth}>
                            <i className="fas fa-chevron-left" />
                          </button>
                          <div className="calendar-month-year">
                            <select value={calendarYear} onChange={(e) => setCalendarYear(Number(e.target.value))}>
                              {yearOptions.map((y) => (
                                <option key={y} value={y}>
                                  {y}
                                </option>
                              ))}
                            </select>
                            <select value={calendarMonth} onChange={(e) => setCalendarMonth(Number(e.target.value))}>
                              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                                <option key={m} value={m}>
                                  {String(m).padStart(2, "0")}
                                </option>
                              ))}
                            </select>
                          </div>
                          <button type="button" className="calendar-nav-btn" onClick={gotoNextMonth}>
                            <i className="fas fa-chevron-right" />
                          </button>
                        </div>

                        <div style={{ marginBottom: 8, fontWeight: 700, color: "#1f2937", textAlign: "center" }}>
                          {monthLabel(calendarYear, calendarMonth)}
                        </div>

                        <div className="calendar-weekdays">
                          {["S", "M", "T", "W", "T", "F", "S"].map((w) => (
                            <div key={w} className="calendar-weekday">
                              {w}
                            </div>
                          ))}
                        </div>

                        <div className="calendar-days">
                          {calendarCells.map((cell) => {
                            const isStart = cell.ymd === dateFrom;
                            const isEnd = cell.ymd === dateTo;
                            const inRange = cell.ymd >= dateFrom && cell.ymd <= dateTo;
                            const inPreview =
                              previewRange && cell.ymd >= previewRange.from && cell.ymd <= previewRange.to;
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
                              >
                                {cell.day}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {groupIds.length > 0 && (
                  <div className="transaction-company-filter" style={{ display: "flex", marginTop: 12 }}>
                    <span className="transaction-company-label">GroupID:</span>
                    <div className="transaction-company-buttons">
                      {groupIds.map((gid) => (
                        <button
                          key={gid}
                          type="button"
                          className={`transaction-company-btn${selectedGroup === gid ? " active" : ""}`}
                          onClick={() => onGroupClick(gid)}
                        >
                          {gid}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {filteredCompanies.length > 0 && (
                  <div className="transaction-company-filter" style={{ display: "flex", marginTop: 10 }}>
                    <span className="transaction-company-label">Company:</span>
                    <div className="transaction-company-buttons">
                      {selectedGroup && filteredCompanies.length > 1 && (
                        <button
                          type="button"
                          className={`transaction-company-btn dashboard-all-btn${groupAllMode ? " active" : ""}`}
                          onClick={async () => {
                            if (groupAllMode) {
                              setGroupAllMode(false);
                              await switchCompany(filteredCompanies[0].id);
                            } else {
                              setGroupAllMode(true);
                            }
                          }}
                        >
                          All
                        </button>
                      )}
                      {filteredCompanies.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className={`transaction-company-btn${
                            !groupAllMode && parseInt(c.id, 10) === parseInt(companyId, 10) ? " active" : ""
                          }`}
                          onClick={async () => {
                            setGroupAllMode(false);
                            await switchCompany(c.id);
                          }}
                        >
                          {c.company_id}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {currencies.length > 0 && (
                  <div className="transaction-company-filter" style={{ display: "flex", marginTop: 10 }}>
                    <span className="transaction-company-label">Currency:</span>
                    <div className="transaction-company-buttons">
                      {currencies.map((code) => (
                        <button
                          key={code}
                          type="button"
                          className={`transaction-company-btn${currencyCode === code ? " active" : ""}`}
                          onClick={() => setCurrencyCode(code)}
                        >
                          {code}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div
              className="dashboard-kpi-card dashboard-kpi-card--blue"
              id="earnings-card-wrapper"
              style={{ display: kpi.showEarnings ? "flex" : "none" }}
            >
              <div className="kpi-icon">
                <i className="fas fa-hand-holding-usd" />
              </div>
              <div className="kpi-text">
                <div className="kpi-label">Earnings</div>
                <div className="kpi-value" id="earnings-value">
                  {loading ? "…" : formatCurrency(kpi.earnings)}
                </div>
              </div>
            </div>
          </div>

          <div className="dashboard-kpi-grid">
            <div className="dashboard-kpi-card dashboard-kpi-card--blue">
              <div className="kpi-icon">
                <i className="fas fa-wallet" />
              </div>
              <div className="kpi-text">
                <div className="kpi-label">Profit</div>
                <div className="kpi-value">{loading ? "…" : formatCurrency(kpi.profit)}</div>
              </div>
            </div>
            <div className="dashboard-kpi-card dashboard-kpi-card--red">
              <div className="kpi-icon">
                <i className="fas fa-arrow-down" />
              </div>
              <div className="kpi-text">
                <div className="kpi-label">Expenses</div>
                <div className="kpi-value">{loading ? "…" : formatCurrency(kpi.expenses)}</div>
              </div>
            </div>
            <div className="dashboard-kpi-card dashboard-kpi-card--green">
              <div className="kpi-icon">
                <i className="fas fa-chart-line" />
              </div>
              <div className="kpi-text">
                <div className="kpi-label">NET PROFIT</div>
                <div className="kpi-value">{loading ? "…" : formatCurrency(kpi.netProfit)}</div>
              </div>
            </div>
          </div>

          <div className="dashboard-chart-section">
            <div
              className="dashboard-chart-header"
              style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}
            >
              <div>
                <div className="dashboard-chart-title">Trend Chart</div>
                <div className="dashboard-date-info" id="chart-date-range">
                  {dashboardData?.date_range
                    ? `${formatDisplayDate(dashboardData.date_range.from)} to ${formatDisplayDate(
                        dashboardData.date_range.to
                      )}`
                    : `${formatDisplayDate(dateFrom)} to ${formatDisplayDate(dateTo)}`}
                </div>
              </div>
              <div className="dashboard-chart-buttons" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {["Profit", "Expenses", "Net Profit", "Earnings"].map((label, i) => {
                  const colors = ["#3b82f6", "#ef4444", "#10b981", "#f59e0b"];
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
                    <Area type="monotone" dataKey="profit" name="Profit" stroke="#3b82f6" fill="url(#gProfit)" strokeWidth={2} />
                  )}
                  {chartVisible[1] && (
                    <Area type="monotone" dataKey="expenses" name="Expenses" stroke="#ef4444" fill="url(#gExp)" strokeWidth={2} />
                  )}
                  {chartVisible[2] && (
                    <Area type="monotone" dataKey="netProfit" name="Net Profit" stroke="#10b981" fill="url(#gNet)" strokeWidth={2} />
                  )}
                  {chartVisible[3] && (
                    <Area type="monotone" dataKey="earnings" name="Earnings" stroke="#f59e0b" fill="url(#gEarn)" strokeWidth={2} />
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
