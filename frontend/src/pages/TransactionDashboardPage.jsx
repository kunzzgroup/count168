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

function readCookie(name) {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : "";
}

const AVATAR_MAP = {
  male1: "/images/avatar1.png",
  male2: "/images/avatar2.png",
  male3: "/images/avatar3.png",
  male4: "/images/avatar4.png",
  male5: "/images/avatar5.png",
  male6: "/images/avatar6.png",
  male7: "/images/avatar7.png",
  male8: "/images/avatar8.png",
  male9: "/images/avatar9.png",
  female1: "/images/female1.png",
  female2: "/images/female2.png",
  female3: "/images/female3.png",
  female4: "/images/female4.png",
  female5: "/images/female5.png",
  female6: "/images/female6.png",
  female7: "/images/female7.png",
  female8: "/images/female8.png",
  female9: "/images/female9.png",
};

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

  const avatarSrc = useMemo(() => {
    const id = readCookie("selectedAvatar");
    return AVATAR_MAP[id] || AVATAR_MAP.male1;
  }, [me]);

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

  const roleLabel = me?.role ? me.role.charAt(0).toUpperCase() + me.role.slice(1).toLowerCase() : "";
  const permissions = Array.isArray(me?.permissions) ? me.permissions : [];
  const hasFullPermissions = permissions.length === 0;
  const canAccess = (key) => hasFullPermissions || permissions.includes(key);

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

  const logout = () => {
    window.location.assign(new URL("dashboard.php?logout=1", window.location.origin).href);
  };

  const phpHref = (path) => new URL(path, window.location.origin).href;

  return (
    <>
      <div className="informationmenu-overlay" style={{ display: "none" }} aria-hidden="true" />
      <div className="informationmenu">
        <div className="informationmenu-header">
          <div className="header-logo-section">
            <img src="/images/count_whitelogo.png" alt="EAZYCOUNT" className="header-logo" />
          </div>
          <div className="user-info-container">
            <div className="avatar-selector-container">
              <div className="current-avatar">
                <img className="current-avatar-img" src={avatarSrc} alt="" width={36} height={36} />
              </div>
            </div>
            <div className="user-info">
              <div className="user-name">{me?.name || me?.login_id || "—"}</div>
              <div className="user-role">{roleLabel || "User"}</div>
            </div>
          </div>
        </div>

        <div className="informationmenu-content">
          <div className="content-separator" />
          {canAccess("home") && (
            <div className="informationmenu-section">
              <div className="informationmenu-section-title current-page">
                <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
                </svg>
                Home
              </div>
            </div>
          )}
          {me?.has_c168_domain_page_access && (
            <div className="informationmenu-section">
              <div
                className="informationmenu-section-title account-direct"
                onClick={() => navigate("/domain")}
                role="presentation"
              >
                <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm6.93 8h-3.46c-.14-2.01-.5-3.88-1.06-5.38 2.16.76 3.76 2.62 4.52 5.38zm-6.93 0h-4.9c.13-1.78.58-3.51 1.28-4.9.53-1.04 1.16-1.79 1.78-2.21.6-.41.98-.46 1.84-.46v7.57zm0 2v7.57c-.86 0-1.24-.05-1.84-.46-.62-.43-1.25-1.17-1.78-2.21-.7-1.39-1.15-3.12-1.28-4.9h4.9zm2 7.43V12h4.9c-.13 1.78-.58 3.51-1.28 4.9-.53 1.04-1.16 1.79-1.78 2.21-.6.41-.98.46-1.84.46zm0-9.43V4.43c.86 0 1.24.05 1.84.46.62.43 1.25 1.17 1.78 2.21.7 1.39 1.15 3.12 1.28 4.9h-4.9zM5.07 12h3.46c.14 2.01.5 3.88 1.06 5.38-2.16-.76-3.76-2.62-4.52-5.38z" />
                </svg>
                Domain
              </div>
            </div>
          )}
          {me?.has_c168_domain_page_access && (
            <div className="informationmenu-section">
              <div
                className="informationmenu-section-title account-direct"
                onClick={() => window.location.assign(phpHref("announcement.php"))}
                role="presentation"
              >
                <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" />
                </svg>
                Announcement
              </div>
            </div>
          )}
          {canAccess("admin") && (
            <div className="informationmenu-section">
              <div
                className="informationmenu-section-title account-direct"
                onClick={() => window.location.assign(phpHref("userlist.php"))}
                role="presentation"
              >
                <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
                </svg>
                Admin
              </div>
            </div>
          )}
          {canAccess("account") && (
            <>
              <div className="informationmenu-section">
                <div
                  className="informationmenu-section-title account-direct"
                  onClick={() => window.location.assign(phpHref("account-list.php"))}
                  role="presentation"
                >
                  <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                  </svg>
                  Account
                </div>
              </div>
              <div className="informationmenu-section">
                <div
                  className="informationmenu-section-title account-direct"
                  onClick={() => window.location.assign(phpHref("ownership.php"))}
                  role="presentation"
                >
                  <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
                  </svg>
                  Ownership
                </div>
              </div>
            </>
          )}
          {canAccess("process") && (
            <div className="informationmenu-section">
              <div
                className="informationmenu-section-title"
                onClick={() => window.location.assign(phpHref("processlist.php"))}
                role="presentation"
              >
                <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                </svg>
                Process
              </div>
            </div>
          )}
          {canAccess("datacapture") && me?.company_has_gambling && (
            <div className="informationmenu-section">
              <div
                className="informationmenu-section-title"
                onClick={() => window.location.assign(phpHref("datacapture.php"))}
                role="presentation"
              >
                <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z" />
                </svg>
                Data Capture
              </div>
            </div>
          )}
          {canAccess("payment") && (
            <div className="informationmenu-section">
              <div
                className="informationmenu-section-title"
                onClick={() => window.location.assign(phpHref("transaction.php"))}
                role="presentation"
              >
                <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z" />
                </svg>
                Transaction Payment
              </div>
            </div>
          )}
          {canAccess("report") && me?.company_has_gambling && (
            <div className="informationmenu-section">
              <div
                className="informationmenu-section-title"
                onClick={() => window.location.assign(phpHref("customer_report.php"))}
                role="presentation"
              >
                <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 2 2h8c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" />
                </svg>
                Report
              </div>
            </div>
          )}
          {canAccess("maintenance") && (
            <div className="informationmenu-section">
              <div
                className="informationmenu-section-title"
                onClick={() => window.location.assign(phpHref("payment_maintenance.php"))}
                role="presentation"
              >
                <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z" />
                </svg>
                Maintenance
              </div>
            </div>
          )}
        </div>

        <div className="informationmenu-footer">
          <div className={`company-expiration-countdown ${me?.expiration_status || "normal"}`}>
            <svg className="expiration-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <div className="expiration-content">
              <span className="expiration-label">Exp:</span>
              <span className={`expiration-countdown-text ${me?.expiration_status || "normal"}`}>
                {me?.expiration_hint || "—"}
              </span>
            </div>
          </div>
          <button type="button" className="btn logout-btn" onClick={logout}>
            Logout
          </button>
        </div>
      </div>

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
