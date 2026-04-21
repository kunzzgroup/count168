import { useCallback, useEffect, useMemo, useState } from "react";
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
  const [chartVisible, setChartVisible] = useState([true, true, true, true]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const defaultStart = formatYmd(new Date(today.getFullYear(), today.getMonth(), 1));
  const defaultEnd = formatYmd(today);
  const [dateFrom, setDateFrom] = useState(defaultStart);
  const [dateTo, setDateTo] = useState(defaultEnd);
  const [pickYear, setPickYear] = useState(today.getFullYear());
  const [pickMonth, setPickMonth] = useState(today.getMonth() + 1);

  useEffect(() => {
    document.body.classList.remove("bg");
    document.body.classList.add("dashboard-page");
    return () => {
      document.body.classList.remove("dashboard-page");
      document.body.classList.add("bg");
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

  const applyMonthPick = () => {
    const first = new Date(pickYear, pickMonth - 1, 1);
    const lastDay = new Date(pickYear, pickMonth, 0);
    const endCap = today < lastDay ? today : lastDay;
    setDateFrom(formatYmd(first));
    setDateTo(formatYmd(endCap));
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
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <label className="form-label" style={{ margin: 0 }}>
                      Date Range
                    </label>
                    <div className="date-range-picker" style={{ cursor: "default" }}>
                      <i className="fas fa-calendar-alt" />
                      <span id="date-range-display">
                        {formatDisplayDate(dateFrom)} - {formatDisplayDate(dateTo)}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                      <input
                        type="date"
                        className="form-control"
                        style={{ borderRadius: 8, border: "1px solid #e2e8f0", padding: 6 }}
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                      />
                      <input
                        type="date"
                        className="form-control"
                        style={{ borderRadius: 8, border: "1px solid #e2e8f0", padding: 6 }}
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="divider" />

                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <label className="form-label" style={{ margin: 0, display: "flex", alignItems: "center", gap: 4 }}>
                      <i className="fas fa-calendar" style={{ color: "#3b82f6" }} />
                      Select Year & Month
                    </label>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <select
                        className="form-control"
                        style={{ borderRadius: 8, padding: 8, minWidth: 100 }}
                        value={pickYear}
                        onChange={(e) => setPickYear(Number(e.target.value))}
                      >
                        {Array.from({ length: new Date().getFullYear() - 2021 + 2 }, (_, i) => 2022 + i).map((y) => (
                          <option key={y} value={y}>
                            {y}
                          </option>
                        ))}
                      </select>
                      <select
                        className="form-control"
                        style={{ borderRadius: 8, padding: 8, minWidth: 90 }}
                        value={pickMonth}
                        onChange={(e) => setPickMonth(Number(e.target.value))}
                      >
                        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                          <option key={m} value={m}>
                            {String(m).padStart(2, "0")}
                          </option>
                        ))}
                      </select>
                      <button type="button" className="btn btn-secondary" onClick={applyMonthPick}>
                        Apply
                      </button>
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <label className="form-label" style={{ margin: 0, display: "flex", alignItems: "center", gap: 4 }}>
                      <i className="fas fa-clock" style={{ color: "#3b82f6" }} />
                      Quick Select
                    </label>
                    <div className="dropdown">
                      <button
                        type="button"
                        className="btn btn-secondary dropdown-toggle"
                        onClick={() => setQuickOpen((o) => !o)}
                      >
                        <i className="fas fa-calendar-alt" />
                        <span id="quick-select-text">Period</span>
                        <i className="fas fa-chevron-down" />
                      </button>
                      {quickOpen && (
                        <div className="dropdown-menu" style={{ display: "block" }} id="quick-select-dropdown">
                          {[
                            ["today", "Today"],
                            ["yesterday", "Yesterday"],
                            ["thisWeek", "This Week"],
                            ["lastWeek", "Last Week"],
                            ["thisMonth", "This Month"],
                            ["lastMonth", "Last Month"],
                            ["thisYear", "This Year"],
                            ["lastYear", "Last Year"],
                          ].map(([key, label]) => (
                            <button
                              key={key}
                              type="button"
                              className="dropdown-item"
                              onClick={() => {
                                const r = quickRangeToDates(key);
                                if (r) {
                                  setDateFrom(r.startDate);
                                  setDateTo(r.endDate);
                                }
                                setQuickOpen(false);
                              }}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
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
