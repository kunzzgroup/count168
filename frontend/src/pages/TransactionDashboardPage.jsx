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
import { notifyCompanySessionUpdated } from "../utils/companySessionEvents.js";
import { mergeGroupData } from "../utils/dashboardMerge.js";
import { DASHBOARD_I18N } from "../translateFile/dashboardTranslate.js";
import ReportDatePicker from "./report/common/ReportDatePicker.jsx";
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

function formatCurrency(value) {
  return parseFloat(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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

  const handleDateRangeChange = useCallback((from, to) => {
    setDateFrom(from);
    setDateTo(to);
  }, []);

  const periodPresets = useMemo(
    () => [
      { key: "today", label: i18n.today },
      { key: "yesterday", label: i18n.yesterday },
      { key: "thisWeek", label: i18n.thisWeek },
      { key: "lastWeek", label: i18n.lastWeek },
      { key: "thisMonth", label: i18n.thisMonth },
      { key: "lastMonth", label: i18n.lastMonth },
      { key: "thisYear", label: i18n.thisYear },
      { key: "lastYear", label: i18n.lastYear },
    ],
    [i18n]
  );

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

  const fetchDashboardPayload = async (cid) => {
    const q = new URLSearchParams({
      date_from: dateFrom,
      date_to: dateTo,
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
  }, [dashboardData, selectedGroup]);

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
          <div className="dashboard-card dashboard-filter-panel">
            <div className="dashboard-filter-panel__head">
              <span className="dashboard-filter-panel__title">{i18n.filterSection}</span>
            </div>
            <div className="dashboard-card-body dashboard-filter-panel__body">
              <ReportDatePicker
                dateFrom={dateFrom}
                dateTo={dateTo}
                onRangeChange={handleDateRangeChange}
                containerClass="dashboard-filter-date-field"
                label={i18n.captureDate}
                placeholder={i18n.selectDateRange}
                selectEndDateHint={i18n.selectEndDate}
                outlinedFloatingLabel
                captureDateStyle
                periodPresets={periodPresets}
                periodShortcutsAria={i18n.periodShortcutsAria}
                monthLabels={i18n.monthLabels}
                weekdaysShort={i18n.weekdaysShort}
              />

              {(groupIds.length > 0 || companiesForPicker.length > 0 || currencies.length > 0) && (
                <div className="user-gc-inline-panel dashboard-filter-gc-panel">
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
