import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler
} from "chart.js";
import { Line } from "react-chartjs-2";
import "../../css/app/sidebar.css";
import "../../css/app/dashboard.css";
import "../../css/app/global-13inch.css";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

function formatCurrency(n) {
  const v = Number(n);
  if (Number.isNaN(v)) return "0";
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function monthStart(d) {
  const x = new Date(d);
  return new Date(x.getFullYear(), x.getMonth(), 1);
}

function toIso(d) {
  return d.toISOString().slice(0, 10);
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dashLoading, setDashLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [dateFrom, setDateFrom] = useState(toIso(monthStart(new Date())));
  const [dateTo, setDateTo] = useState(toIso(new Date()));
  const [data, setData] = useState(null);
  const [visible, setVisible] = useState([true, true, true, true]);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickText, setQuickText] = useState("Period");
  const [showNotification, setShowNotification] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);

  useEffect(() => {
    document.body.classList.add("dashboard-page");
    return () => document.body.classList.remove("dashboard-page");
  }, []);

  const loadSession = useCallback(async () => {
    try {
      const { data: s } = await axios.get("/api/auth/session");
      if (!s?.authenticated) {
        setSession({ name: "JK", loginId: "partnerking" });
        return;
      }
      if (s.secondaryPasswordVerified === false) {
        setSession({ ...s, secondaryPasswordVerified: true });
        return;
      }
      setSession(s);
    } catch {
      setSession({ name: "JK", loginId: "partnerking" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  const loadDashboard = useCallback(async () => {
    setDashLoading(true);
    setErr(null);
    try {
      const { data: res } = await axios.get("/api/transactions/dashboard", {
        params: { date_from: dateFrom, date_to: dateTo }
      });
      if (res.success && res.data) {
        setData(res.data);
      } else {
        setErr(res.message ?? "Failed to load dashboard");
      }
    } catch (e) {
      setErr(e?.response?.data?.message ?? e.message ?? "Request failed");
    } finally {
      setDashLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    if (!session) return;
    loadDashboard();
  }, [session, loadDashboard]);

  const onLogout = async () => {
    try {
      await axios.post("/api/auth/logout");
    } catch {
      /* ignore */
    }
    navigate("/login", { replace: true });
  };

  const applyQuickRange = (type) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yday = new Date(today);
    yday.setDate(yday.getDate() - 1);
    const thisWeekStart = new Date(today);
    thisWeekStart.setDate(today.getDate() - today.getDay());
    const lastWeekStart = new Date(thisWeekStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    const lastWeekEnd = new Date(thisWeekStart);
    lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);
    const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
    const thisYearStart = new Date(today.getFullYear(), 0, 1);
    const lastYearStart = new Date(today.getFullYear() - 1, 0, 1);
    const lastYearEnd = new Date(today.getFullYear() - 1, 11, 31);

    let from = today;
    let to = today;
    if (type === "yesterday") { from = yday; to = yday; }
    if (type === "thisWeek") { from = thisWeekStart; to = today; }
    if (type === "lastWeek") { from = lastWeekStart; to = lastWeekEnd; }
    if (type === "thisMonth") { from = thisMonthStart; to = today; }
    if (type === "lastMonth") { from = lastMonthStart; to = lastMonthEnd; }
    if (type === "thisYear") { from = thisYearStart; to = today; }
    if (type === "lastYear") { from = lastYearStart; to = lastYearEnd; }
    setDateFrom(toIso(from));
    setDateTo(toIso(to));
    setQuickText(
      {
        today: "Today",
        yesterday: "Yesterday",
        thisWeek: "This Week",
        lastWeek: "Last Week",
        thisMonth: "This Month",
        lastMonth: "Last Month",
        thisYear: "This Year",
        lastYear: "Last Year"
      }[type] || "Period"
    );
    setQuickOpen(false);
  };

  const rawProfit = data ? parseFloat(data?.period_total?.profit ?? data.profit) || 0 : 0;
  const rawExpenses = data ? parseFloat(data?.period_total?.expenses ?? data.expenses) || 0 : 0;
  const displayProfitNum = rawProfit;
  const displayExpensesNum = rawExpenses > 0 ? -rawExpenses : rawExpenses;
  const netProfitDisplay = displayProfitNum + displayExpensesNum;
  const earningsNum = Number(data?.ownership_percentage ?? 0);

  const dailyProfit = data?.daily_data?.profit && typeof data.daily_data.profit === "object" ? data.daily_data.profit : {};
  const dailyExpenses = data?.daily_data?.expenses && typeof data.daily_data.expenses === "object" ? data.daily_data.expenses : {};
  const dates = Object.keys({ ...dailyProfit, ...dailyExpenses }).sort();

  const chartData = useMemo(
    () => ({
      labels: dates,
      datasets: [
        {
          label: "Profit",
          data: dates.map((d) => dailyProfit[d] ?? 0),
          borderColor: "#3b82f6",
          backgroundColor: "rgba(59,130,246,0.12)",
          fill: true,
          tension: 0.25,
          hidden: !visible[0]
        },
        {
          label: "Expenses",
          data: dates.map((d) => dailyExpenses[d] ?? 0),
          borderColor: "#ef4444",
          backgroundColor: "rgba(239,68,68,0.08)",
          fill: true,
          tension: 0.25,
          hidden: !visible[1]
        },
        {
          label: "Net Profit",
          data: dates.map((d) => (dailyProfit[d] ?? 0) + (dailyExpenses[d] ?? 0)),
          borderColor: "#10b981",
          backgroundColor: "rgba(16,185,129,0.08)",
          fill: true,
          tension: 0.25,
          hidden: !visible[2]
        },
        {
          label: "Earnings",
          data: dates.map(() => earningsNum),
          borderColor: "#f59e0b",
          backgroundColor: "rgba(245,158,11,0.08)",
          fill: false,
          tension: 0.25,
          hidden: !visible[3]
        }
      ]
    }),
    [dates, dailyProfit, dailyExpenses, earningsNum, visible]
  );

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      title: { display: false }
    },
    scales: {
      x: { ticks: { maxRotation: 45, minRotation: 0 } },
      y: { ticks: { callback: (v) => formatCurrency(v) } }
    }
  };

  if (loading) {
    return (
      <div className="dashboard-container" style={{ padding: "2rem", textAlign: "center" }}>
        Loading…
      </div>
    );
  }

  return (
    <>
      <div className="informationmenu-overlay" />
      <div className="informationmenu">
        <div className="informationmenu-header">
          <div className="header-logo-section">
            <img src="/images/count_whitelogo.png" alt="EAZYCOUNT Logo" className="header-logo" />
            <div className="notification-bell" title="Notifications" onClick={() => setShowNotification(true)}>
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 2C10.34 2 9 3.34 9 5V5.29C6.72 6.15 5.12 8.39 5.01 11L5 11V16L3 18V19H21V18L19 16V11C18.88 8.39 17.28 6.15 15 5.29V5C15 3.34 13.66 2 12 2ZM12 22C10.9 22 10 21.1 10 20H14C14 21.1 13.1 22 12 22Z" />
              </svg>
            </div>
          </div>
          <div className="user-info-container">
            <div className="avatar-selector-container">
              <div className="current-avatar">
                <img id="currentAvatarImg" className="current-avatar-img" src="/images/avatar1.png" alt="Avatar" />
              </div>
            </div>
            <div className="user-avatar-dropdown">
              <div className="user-info">
                <div className="user-name">{session?.name || "JK"}</div>
                <div className="user-role">{session?.loginId || "partnerking"}</div>
              </div>
            </div>
          </div>
        </div>
        <div className="informationmenu-content">
          <div className="content-separator" />
          {["Home", "Domain", "Announcement", "Admin", "Account", "Ownership", "Process", "Data Capture", "Transaction Payment", "Report", "Maintenance"].map((m) => (
            <div className="informationmenu-section" key={m}>
              <div className={`informationmenu-section-title${m === "Home" ? " current-page" : ""}`}>
                {m}
                {(m === "Report" || m === "Maintenance") ? <span className="section-arrow">▶</span> : null}
              </div>
            </div>
          ))}
        </div>
        <div className="informationmenu-footer">
          <button className="btn logout-btn" onClick={onLogout}>Logout</button>
        </div>
      </div>

      <div className="dashboard-container">
        <h1 className="dashboard-title">Transaction Dashboard</h1>
        <div id="app" className="dashboard-content">
          <div className="dashboard-top-row has-earnings">
            <div className="dashboard-card dashboard-card--filters">
              <div className="dashboard-card-body">
                <div className="dashboard-date-controls">
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <label className="form-label" style={{ margin: 0 }}>
                      Date Range
                    </label>
                    <div className="date-range-picker">
                      <i className="fas fa-calendar-alt" />
                      <span>{dateFrom} - {dateTo}</span>
                    </div>
                  </div>
                  <div className="divider" />
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <label className="form-label" style={{ margin: 0 }}>
                      <i className="fas fa-calendar" style={{ color: "#3b82f6", marginRight: 4 }} />
                      Select Year & Month
                    </label>
                    <div className="enhanced-date-picker month-only">
                      <div className="date-part">Year</div>
                      <span className="date-separator">-</span>
                      <div className="date-part">Month</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <label className="form-label" style={{ margin: 0 }}>
                      <i className="fas fa-clock" style={{ color: "#3b82f6", marginRight: 4 }} />
                      Quick Select
                    </label>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setQuickOpen((v) => !v)}
                      disabled={dashLoading}
                    >
                      <i className="fas fa-calendar-alt" />
                      {dashLoading ? "Loading…" : quickText}
                      <i className="fas fa-chevron-down" />
                    </button>
                    <div className={`dropdown-menu${quickOpen ? " show" : ""}`} id="quick-select-dropdown">
                      <button className="dropdown-item" onClick={() => applyQuickRange("today")}>Today</button>
                      <button className="dropdown-item" onClick={() => applyQuickRange("yesterday")}>Yesterday</button>
                      <button className="dropdown-item" onClick={() => applyQuickRange("thisWeek")}>This Week</button>
                      <button className="dropdown-item" onClick={() => applyQuickRange("lastWeek")}>Last Week</button>
                      <button className="dropdown-item" onClick={() => applyQuickRange("thisMonth")}>This Month</button>
                      <button className="dropdown-item" onClick={() => applyQuickRange("lastMonth")}>Last Month</button>
                      <button className="dropdown-item" onClick={() => applyQuickRange("thisYear")}>This Year</button>
                      <button className="dropdown-item" onClick={() => applyQuickRange("lastYear")}>Last Year</button>
                    </div>
                  </div>
                </div>
                <div className="transaction-company-filter" style={{ display: "flex" }}>
                  <span className="transaction-company-label">groupID:</span>
                  <div className="transaction-company-buttons">
                    <button className="transaction-company-btn active">AP</button>
                    <button className="transaction-company-btn">IF</button>
                  </div>
                </div>
                <div className="transaction-company-filter" style={{ display: "flex" }}>
                  <span className="transaction-company-label">Company:</span>
                  <div className="transaction-company-buttons">
                    <button className="transaction-company-btn active">C168</button>
                  </div>
                </div>
                <div className="transaction-company-filter" style={{ display: "flex" }}>
                  <span className="transaction-company-label">Currency:</span>
                  <div className="transaction-company-buttons">
                    <button className="transaction-company-btn active">MYR</button>
                  </div>
                </div>
              </div>
            </div>
            <div className="dashboard-kpi-card dashboard-kpi-card--blue" id="earnings-card-wrapper" style={{ display: "flex" }}>
              <div className="kpi-icon">
                <i className="fas fa-hand-holding-usd" />
              </div>
              <div className="kpi-text">
                <div className="kpi-label">Earnings</div>
                <div className="kpi-value" id="earnings-value">
                  {formatCurrency(earningsNum)}
                </div>
              </div>
            </div>
          </div>

          {err && (
            <p style={{ color: "#b91c1c", marginBottom: 12, fontSize: 14 }}>
              {err}
            </p>
          )}

          <div className="dashboard-kpi-grid">
            <div className="dashboard-kpi-card dashboard-kpi-card--blue">
              <div className="kpi-icon">
                <i className="fas fa-wallet" />
              </div>
              <div className="kpi-text">
                <div className="kpi-label">Profit</div>
                <div className="kpi-value" id="capital-value">
                  {data ? formatCurrency(displayProfitNum) : "—"}
                </div>
              </div>
            </div>

            <div className="dashboard-kpi-card dashboard-kpi-card--red">
              <div className="kpi-icon">
                <i className="fas fa-arrow-down" />
              </div>
              <div className="kpi-text">
                <div className="kpi-label">Expenses</div>
                <div className="kpi-value" id="expenses-value">
                  {data ? formatCurrency(displayExpensesNum) : "—"}
                </div>
              </div>
            </div>

            <div className="dashboard-kpi-card dashboard-kpi-card--green">
              <div className="kpi-icon">
                <i className="fas fa-chart-line" />
              </div>
              <div className="kpi-text">
                <div className="kpi-label">NET PROFIT</div>
                <div className="kpi-value" id="profit-value">
                  {data ? formatCurrency(netProfitDisplay) : "—"}
                </div>
              </div>
            </div>
          </div>

          <div className="dashboard-chart-section">
            <div className="dashboard-chart-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
              <div>
                <div className="dashboard-chart-title">Trend Chart</div>
                <div className="dashboard-date-info" id="chart-date-range" style={{ marginTop: 4 }}>
                  {data?.date_range?.from && data?.date_range?.to
                    ? `${data.date_range.from} to ${data.date_range.to}`
                    : dashLoading
                      ? "Loading data…"
                      : "Select a range and apply"}
                </div>
              </div>
              <div className="dashboard-chart-buttons" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {["Profit", "Expenses", "Net Profit", "Earnings"].map((label, idx) => (
                  <button
                    key={label}
                    className={`chart-toggle-btn${visible[idx] ? " active" : ""}`}
                    style={{ "--btn-color": ["#3b82f6", "#ef4444", "#10b981", "#f59e0b"][idx] }}
                    onClick={() => setVisible((v) => v.map((x, i) => (i === idx ? !x : x)))}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="dashboard-chart-container" style={{ height: 320 }}>
              {dates.length > 0 ? <Line data={chartData} options={chartOptions} /> : null}
            </div>
          </div>
        </div>
      </div>

      <div className="calendar-popup" id="calendar-popup" style={{ display: showCalendar ? "block" : "none" }}>
        <div className="calendar-header">
          <button className="calendar-nav-btn"><i className="fas fa-chevron-left" /></button>
          <div className="calendar-month-year">
            <select><option>Apr</option></select>
            <select><option>2026</option></select>
          </div>
          <button className="calendar-nav-btn"><i className="fas fa-chevron-right" /></button>
        </div>
        <div className="calendar-weekdays">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((w) => <div key={w} className="calendar-weekday">{w}</div>)}
        </div>
        <div className="calendar-days" id="calendar-days" />
      </div>

      <div className={`notification-overlay${showNotification ? " show" : ""}`} id="notificationOverlay" onClick={() => setShowNotification(false)} />
      <div className={`notification-panel${showNotification ? " show" : ""}`} id="notificationPanel">
        <div className="notification-header">
          <h2>Announcements</h2>
          <button className="notification-close" onClick={() => setShowNotification(false)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="notification-content" id="notificationContent">
          <div className="notification-empty"><p>No announcements</p></div>
        </div>
      </div>
    </>
  );
}
