import { useEffect, useMemo, useRef, useState } from "react";
import {
  CategoryScale,
  Chart,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
  Legend,
} from "chart.js";
import Card from "../components/Card";
import {
  getCompanies,
  getCurrencies,
  getDashboard,
  getSessionMe,
  switchCompanySession,
} from "../services/api";

Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend
);

function toYmd(date) {
  return date.toISOString().slice(0, 10);
}

function getMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { dateFrom: toYmd(start), dateTo: toYmd(end) };
}

function getQuickRange(type) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (type === "today") return { dateFrom: toYmd(today), dateTo: toYmd(today) };
  if (type === "yesterday") {
    const y = new Date(today);
    y.setDate(y.getDate() - 1);
    return { dateFrom: toYmd(y), dateTo: toYmd(y) };
  }
  if (type === "thisMonth") return getMonthRange();
  if (type === "lastMonth") {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    return { dateFrom: toYmd(start), dateTo: toYmd(end) };
  }
  if (type === "thisYear") {
    return {
      dateFrom: `${now.getFullYear()}-01-01`,
      dateTo: `${now.getFullYear()}-12-31`,
    };
  }
  return getMonthRange();
}

function mergeDailyMap(target, source) {
  if (!source || typeof source !== "object") return;
  Object.keys(source).forEach((date) => {
    target[date] = Number(target[date] || 0) + Number(source[date] || 0);
  });
}

function buildMergedGroupData(dataList, dateFrom, dateTo) {
  let capital = 0;
  let expenses = 0;
  let profit = 0;
  let periodCapital = 0;
  let periodExpenses = 0;
  let periodProfit = 0;
  const dailyCapital = {};
  const dailyExpenses = {};
  const dailyProfit = {};
  const companyEarnings = [];

  dataList.forEach((d) => {
    capital += Number(d.capital || 0);
    expenses += Number(d.expenses || 0);
    profit += Number(d.profit || 0);
    periodCapital += Number(d?.period_total?.capital || 0);
    periodExpenses += Number(d?.period_total?.expenses || 0);
    periodProfit += Number(d?.period_total?.profit || 0);

    mergeDailyMap(dailyCapital, d?.daily_data?.capital);
    mergeDailyMap(dailyExpenses, d?.daily_data?.expenses);
    mergeDailyMap(dailyProfit, d?.daily_data?.profit);

    const pct = Number(d.ownership_percentage || 0);
    const grpPct = Number(d.group_equity_percentage || 0);
    const grpAccPct = Number(d.group_account_percentage || 0);
    const hasGrp = Boolean(d.has_group_ownership);
    const rawP = Number(d?.period_total?.profit ?? d.profit ?? 0);
    const rawE = Number(d?.period_total?.expenses ?? d.expenses ?? 0);
    const displayE = rawE > 0 ? -rawE : rawE;
    const netProfit = rawP + displayE;
    const effectivePct = hasGrp
      ? pct / 100 + (grpPct / 100) * (grpAccPct / 100)
      : pct / 100;
    companyEarnings.push(netProfit * effectivePct);
  });

  const totalEarnings = companyEarnings.reduce((sum, v) => sum + v, 0);

  return {
    capital,
    expenses,
    profit,
    earnings: totalEarnings,
    daily_data: {
      capital: dailyCapital,
      expenses: dailyExpenses,
      profit: dailyProfit,
    },
    date_range: {
      from: dataList[0]?.date_range?.from || dateFrom,
      to: dataList[0]?.date_range?.to || dateTo,
    },
    period_total: {
      capital: periodCapital,
      expenses: periodExpenses,
      profit: periodProfit,
    },
  };
}

function Dashboard() {
  const defaultRange = getMonthRange();
  const chartRef = useRef(null);
  const chartInstanceRef = useRef(null);
  const [me, setMe] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [companyId, setCompanyId] = useState("");
  const [selectedGroupFilter, setSelectedGroupFilter] = useState(null);
  const [isGroupAllMode, setIsGroupAllMode] = useState(false);
  const [currency, setCurrency] = useState("");
  const [dateFrom, setDateFrom] = useState(defaultRange.dateFrom);
  const [dateTo, setDateTo] = useState(defaultRange.dateTo);
  const [capital, setCapital] = useState(0);
  const [expenses, setExpenses] = useState(0);
  const [profit, setProfit] = useState(0);
  const [earnings, setEarnings] = useState(0);
  const [dailyData, setDailyData] = useState({});
  const [dateRangeText, setDateRangeText] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [activeLines, setActiveLines] = useState({
    capital: true,
    expenses: true,
    profit: true,
    earnings: true,
  });
  const GROUP_FILTER_KEY = "dashboard_group_filter";

  const cards = [
    { title: "Profit", value: capital },
    { title: "Expenses", value: expenses },
    { title: "NET PROFIT", value: profit },
    { title: "Earnings", value: earnings },
  ];

  useEffect(() => {
    init();
  }, []);

  useEffect(() => {
    if (selectedGroupFilter) {
      sessionStorage.setItem(GROUP_FILTER_KEY, selectedGroupFilter);
    } else {
      sessionStorage.removeItem(GROUP_FILTER_KEY);
    }
  }, [selectedGroupFilter]);

  const groups = useMemo(() => {
    const map = new Map();
    companies.forEach((item) => {
      const raw = (item.group_id || "").toString().trim();
      if (!raw) return;
      const groupKey = raw.toUpperCase();
      if (!map.has(groupKey)) map.set(groupKey, []);
      map.get(groupKey).push(item);
    });
    return Array.from(map.entries()).map(([id, items]) => ({ id, label: id, items }));
  }, [companies]);

  const companiesInGroup = useMemo(() => {
    if (selectedGroupFilter) {
      return companies.filter(
        (c) => ((c.group_id || "").toString().trim().toUpperCase() === selectedGroupFilter)
      );
    }
    return companies.filter((c) => !((c.group_id || "").toString().trim()));
  }, [companies, selectedGroupFilter]);

  const selectedGroupCompanies = useMemo(
    () => companiesInGroup.filter((c) => c.company_id && String(c.company_id).trim() !== ""),
    [companiesInGroup]
  );

  const labels = useMemo(() => {
    const keySets = [
      Object.keys(dailyData.capital || {}),
      Object.keys(dailyData.expenses || {}),
      Object.keys(dailyData.profit || {}),
    ];
    return Array.from(new Set(keySets.flat())).sort();
  }, [dailyData]);

  useEffect(() => {
    renderChart();
    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
      }
    };
  }, [labels, dailyData, activeLines]);

  const init = async () => {
    setLoading(true);
    setMessage("");
    try {
      const [meResponse, companyResponse] = await Promise.all([
        getSessionMe(),
        getCompanies(),
      ]);
      const meData = meResponse.data?.data || null;
      const items = companyResponse.data?.data || [];
      setMe(meData);
      setCompanies(items);

      if (items.length > 0) {
        const savedGroup = sessionStorage.getItem(GROUP_FILTER_KEY);
        const preferred = meData?.company_id
          ? items.find((item) => Number(item.id) === Number(meData.company_id))
          : null;
        const groupMatchedCompany =
          savedGroup && savedGroup.trim() !== ""
            ? items.find(
                (item) =>
                  ((item.group_id || "").toString().trim().toUpperCase() ===
                    savedGroup.toUpperCase()) &&
                  item.company_id &&
                  String(item.company_id).trim() !== ""
              )
            : null;
        const first = groupMatchedCompany || preferred || items[0];
        const firstGroup = (first.group_id || "").toString().trim().toUpperCase();
        const hasSavedGroup =
          savedGroup &&
          items.some(
            (item) =>
              ((item.group_id || "").toString().trim().toUpperCase() ===
                savedGroup.toUpperCase())
          );
        setSelectedGroupFilter(
          hasSavedGroup ? savedGroup.toUpperCase() : firstGroup || null
        );
        const firstId = String(first.id);
        setCompanyId(firstId);
        await loadCurrencies(firstId, "");
        await fetchDashboard(firstId, "", dateFrom, dateTo);
      }
    } catch (error) {
      setMessage(error.message || "读取公司列表失败");
    } finally {
      setLoading(false);
    }
  };

  const loadCurrencies = async (nextCompanyId, nextCurrency = "") => {
    try {
      const response = await getCurrencies(nextCompanyId);
      const list = response.data?.data || [];
      setCurrencies(list);
      setCurrency(nextCurrency);
    } catch (_error) {
      setCurrencies([]);
      setCurrency(nextCurrency);
    }
  };

  const fetchSingleDashboard = async (
    currentCompanyId = companyId,
    currentCurrency = currency,
    currentDateFrom = dateFrom,
    currentDateTo = dateTo
  ) => {
    if (!currentCompanyId) return;
    setLoading(true);
    setMessage("");
    try {
      const response = await getDashboard({
        company_id: currentCompanyId,
        currency: currentCurrency || undefined,
        date_from: currentDateFrom,
        date_to: currentDateTo,
      });
      return response.data?.data || {};
    } catch (error) {
      setMessage(error.message || "读取数据失败");
      return null;
    }
  };

  const applyDashboardPayload = (payload, currentDateFrom, currentDateTo, forceEarnings) => {
    if (!payload) return;
    const netProfit = Number(payload.profit || 0);
    const directPct = Number(payload.ownership_percentage || 0) / 100;
    const groupEquityPct = Number(payload.group_equity_percentage || 0) / 100;
    const groupAccountPct = Number(payload.group_account_percentage || 0) / 100;
    const effectivePct = directPct + groupEquityPct * groupAccountPct;

    setCapital(Number(payload.capital || 0));
    setExpenses(Number(payload.expenses || 0));
    setProfit(netProfit);
    setEarnings(
      typeof forceEarnings === "number" ? forceEarnings : netProfit * effectivePct
    );
    setDailyData(payload.daily_data || {});
    if (payload.date_range?.from && payload.date_range?.to) {
      setDateRangeText(`${payload.date_range.from} ~ ${payload.date_range.to}`);
    } else {
      setDateRangeText(`${currentDateFrom} ~ ${currentDateTo}`);
    }
  };

  const fetchDashboard = async (
    currentCompanyId = companyId,
    currentCurrency = currency,
    currentDateFrom = dateFrom,
    currentDateTo = dateTo,
    currentGroupAllMode = isGroupAllMode
  ) => {
    setLoading(true);
    setMessage("");
    try {
      if (currentGroupAllMode) {
        const groupCompanies = companies.filter(
          (c) =>
            ((c.group_id || "").toString().trim().toUpperCase() === selectedGroupFilter) &&
            c.company_id &&
            String(c.company_id).trim() !== ""
        );
        if (groupCompanies.length === 0) {
          setMessage("当前分组没有可用公司");
          return;
        }
        const resultList = await Promise.all(
          groupCompanies.map((c) =>
            fetchSingleDashboard(
              String(c.id),
              currentCurrency,
              currentDateFrom,
              currentDateTo
            )
          )
        );
        const valid = resultList.filter(Boolean);
        if (valid.length === 0) {
          setMessage("分组数据读取失败");
          return;
        }
        const merged = buildMergedGroupData(valid, currentDateFrom, currentDateTo);
        applyDashboardPayload(
          merged,
          currentDateFrom,
          currentDateTo,
          Number(merged.earnings || 0)
        );
        return;
      }

      const payload = await fetchSingleDashboard(
        currentCompanyId,
        currentCurrency,
        currentDateFrom,
        currentDateTo
      );
      applyDashboardPayload(payload, currentDateFrom, currentDateTo);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = async () => {
    await fetchDashboard(companyId, currency, dateFrom, dateTo);
  };

  const handleCompanyChange = async (nextCompanyId, keepCurrency = false) => {
    setCompanyId(nextCompanyId);
    setIsGroupAllMode(false);
    const selectedCompany = companies.find((c) => String(c.id) === String(nextCompanyId));
    const currentGroup = (selectedCompany?.group_id || "").toString().trim().toUpperCase();
    setSelectedGroupFilter(currentGroup || null);
    try {
      await switchCompanySession(nextCompanyId);
    } catch (_error) {
      // 保持无阻塞，继续走 dashboard 查询结果作为最终判断
    }
    const nextCurrency = keepCurrency ? currency : "";
    await loadCurrencies(nextCompanyId, nextCurrency);
    await fetchDashboard(nextCompanyId, nextCurrency, dateFrom, dateTo, false);
  };

  const handleCurrencyClick = async (nextCurrency) => {
    setCurrency(nextCurrency);
    await fetchDashboard(companyId, nextCurrency, dateFrom, dateTo, isGroupAllMode);
  };

  const toggleLine = (key) => {
    setActiveLines((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const renderChart = () => {
    if (!chartRef.current) return;
    if (chartInstanceRef.current) chartInstanceRef.current.destroy();

    const multiplier = profit !== 0 ? earnings / profit : 0;
    const earningsSeries = labels.map(
      (d) => Number(dailyData?.profit?.[d] || 0) * multiplier
    );

    chartInstanceRef.current = new Chart(chartRef.current, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Profit",
            data: labels.map((d) => Number(dailyData?.capital?.[d] || 0)),
            borderColor: "#3b82f6",
            backgroundColor: "rgba(59,130,246,0.15)",
            hidden: !activeLines.capital,
          },
          {
            label: "Expenses",
            data: labels.map((d) => Number(dailyData?.expenses?.[d] || 0)),
            borderColor: "#ef4444",
            backgroundColor: "rgba(239,68,68,0.15)",
            hidden: !activeLines.expenses,
          },
          {
            label: "Net Profit",
            data: labels.map((d) => Number(dailyData?.profit?.[d] || 0)),
            borderColor: "#22c55e",
            backgroundColor: "rgba(34,197,94,0.15)",
            hidden: !activeLines.profit,
          },
          {
            label: "Earnings",
            data: earningsSeries,
            borderColor: "#f59e0b",
            backgroundColor: "rgba(245,158,11,0.15)",
            hidden: !activeLines.earnings,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
      },
    });
  };

  return (
    <div className="dashboard-page">
      <div className="dashboard-header">
        <h1>Transaction Dashboard{me?.name ? ` - ${me.name}` : ""}</h1>
        <div className="filters">
          <label>
            Date From
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </label>
          <label>
            Date To
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </label>
          <button onClick={applyFilters} disabled={loading}>
            {loading ? "Loading..." : "Apply"}
          </button>
          <div className="quick-buttons">
            <button
              onClick={() => {
                const r = getQuickRange("today");
                setDateFrom(r.dateFrom);
                setDateTo(r.dateTo);
              }}
            >
              Today
            </button>
            <button
              onClick={() => {
                const r = getQuickRange("thisMonth");
                setDateFrom(r.dateFrom);
                setDateTo(r.dateTo);
              }}
            >
              This Month
            </button>
            <button
              onClick={() => {
                const r = getQuickRange("lastMonth");
                setDateFrom(r.dateFrom);
                setDateTo(r.dateTo);
              }}
            >
              Last Month
            </button>
            <button
              onClick={() => {
                const r = getQuickRange("thisYear");
                setDateFrom(r.dateFrom);
                setDateTo(r.dateTo);
              }}
            >
              This Year
            </button>
          </div>
        </div>
        <div className="selector-groups">
          <div className="selector-row">
            <span className="selector-title">Group</span>
            <div className="pill-wrap">
              {groups.map((g) => (
                <button
                  key={g.id}
                  className={selectedGroupFilter === g.id ? "pill active" : "pill"}
                  onClick={async () => {
                    setIsGroupAllMode(false);
                    if (selectedGroupFilter === g.id) {
                      setSelectedGroupFilter(null);
                      const ungrouped = companies.find(
                        (c) => !((c.group_id || "").toString().trim()) && c.company_id
                      );
                      if (ungrouped) {
                        await handleCompanyChange(String(ungrouped.id));
                      }
                      return;
                    }
                    setSelectedGroupFilter(g.id);
                    const first = g.items.find((c) => c.company_id && String(c.company_id).trim() !== "");
                    if (first) await handleCompanyChange(String(first.id));
                  }}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>
          <div className="selector-row">
            <span className="selector-title">Company</span>
            <div className="pill-wrap">
              {selectedGroupCompanies.length > 1 ? (
                <button
                  className={isGroupAllMode ? "pill active" : "pill"}
                  onClick={() => {
                    setIsGroupAllMode(true);
                    fetchDashboard(companyId, currency, dateFrom, dateTo, true);
                  }}
                >
                  All
                </button>
              ) : null}
              {selectedGroupCompanies.map((item) => (
                <button
                  key={item.id}
                  className={
                    !isGroupAllMode && String(item.id) === String(companyId)
                      ? "pill active"
                      : "pill"
                  }
                  onClick={() => handleCompanyChange(String(item.id))}
                >
                  {item.company_id}
                </button>
              ))}
            </div>
          </div>
          <div className="selector-row">
            <span className="selector-title">Currency</span>
            <div className="pill-wrap">
              <button
                className={currency === "" ? "pill active" : "pill"}
                onClick={() => handleCurrencyClick("")}
              >
                All
              </button>
              {currencies.map((item) => (
                <button
                  key={item.id}
                  className={currency === item.code ? "pill active" : "pill"}
                  onClick={() => handleCurrencyClick(item.code)}
                >
                  {item.code}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="cards-grid">
        {cards.map((item) => (
          <Card key={item.title} title={item.title} value={item.value} />
        ))}
      </div>

      <section className="chart-section">
        <div className="chart-head">
          <h2>Trend Chart</h2>
          <span>{dateRangeText || "No data"}</span>
        </div>
        <div className="line-toggles">
          <button className={activeLines.capital ? "on" : ""} onClick={() => toggleLine("capital")}>
            Profit
          </button>
          <button className={activeLines.expenses ? "on" : ""} onClick={() => toggleLine("expenses")}>
            Expenses
          </button>
          <button className={activeLines.profit ? "on" : ""} onClick={() => toggleLine("profit")}>
            Net Profit
          </button>
          <button className={activeLines.earnings ? "on" : ""} onClick={() => toggleLine("earnings")}>
            Earnings
          </button>
        </div>
        <div className="chart-canvas-wrap">
          <canvas ref={chartRef} />
        </div>
      </section>

      {message ? <p className="message">{message}</p> : null}
    </div>
  );
}

export default Dashboard;
