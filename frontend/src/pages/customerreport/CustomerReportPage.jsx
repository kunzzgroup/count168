import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { notifyCompanySessionUpdated } from "../../utils/companySessionEvents.js";
import { assetUrl, buildApiUrl } from "../../utils/apiUrl.js";
import {
  fetchAccounts,
  fetchCurrencies,
  fetchCustomerReport,
  formatAmount,
  formatDmy,
  formatYmd,
  parseYmd,
  quickRangeToDates,
} from "./customerReportLogic.js";

// Helper for company button visibility
function companyButtonStyle(comp, snapGroup) {
  const cGid = comp.group_id != null ? String(comp.group_id).toUpperCase().trim() : "";
  if (snapGroup) {
    return cGid === snapGroup ? {} : { display: "none" };
  }
  return cGid ? { display: "none" } : {};
}

export default function CustomerReportPage() {
  const navigate = useNavigate();
  
  // -- State: Boot / Me --
  const [bootLoading, setBootLoading] = useState(true);
  const [me, setMe] = useState(null);
  const [companies, setCompanies] = useState([]);
  
  // -- State: Filters --
  const [companyId, setCompanyId] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [accountId, setAccountId] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [selectedCurrencies, setSelectedCurrencies] = useState([]);
  const [showAllCurrencies, setShowAllCurrencies] = useState(false);
  
  // Date Range
  const today = useMemo(() => new Date(), []);
  const [dateFrom, setDateFrom] = useState(formatYmd(today));
  const [dateTo, setDateTo] = useState(formatYmd(today));
  
  // -- State: Data --
  const [accounts, setAccounts] = useState([]);
  const [currencyList, setCurrencyList] = useState([]);
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  
  // -- State: UI Interactivity --
  const [accountSearch, setAccountSearch] = useState("");
  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false);
  const [quickSelectOpen, setQuickSelectOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarYear, setCalendarYear] = useState(today.getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(today.getMonth() + 1);
  const [pendingStartDate, setPendingStartDate] = useState(null);
  const [hoverDate, setHoverDate] = useState(null);
  
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);
  const dropdownRef = useRef(null);
  const accountDropdownRef = useRef(null);

  const notify = useCallback((message, type = "success") => {
    setToast({ message, type });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2000);
  }, []);

  // -- Initialization --
  useEffect(() => {
    document.body.classList.remove("bg", "account-page", "announcement-page", "datacapture-page", "transaction-page");
    document.body.classList.add("dashboard-page", "report-page");
    
    // Inject fonts and legacy CSS (though we aim for pure react, we keep the styling)
    const links = [
      "https://fonts.googleapis.com/css2?family=Amaranth:wght@400;700&display=swap",
      "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css",
      assetUrl("css/accountCSS.css"),
      assetUrl("css/transaction.css"),
      assetUrl("css/customer_report.css"),
      assetUrl("css/global-13inch.css"),
    ];
    
    links.forEach(href => {
      if (!document.querySelector(`link[href="${href}"]`)) {
        const l = document.createElement("link");
        l.rel = "stylesheet";
        l.href = href;
        document.head.appendChild(l);
      }
    });

    return () => {
      document.body.classList.remove("report-page");
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  // -- Boot Logic --
  useEffect(() => {
    (async () => {
      try {
        const meRes = await fetch(buildApiUrl("api/session/current_user_api.php"), { credentials: "include" });
        const meJson = await meRes.json();
        if (!meRes.ok || !meJson.success || !meJson.data) {
          navigate("/login", { replace: true });
          return;
        }
        const u = meJson.data;
        if (String(u.user_type || "").toLowerCase() === "member") {
          window.location.assign(new URL("/member", window.location.origin).href);
          return;
        }
        
        const perms = Array.isArray(u.permissions) ? u.permissions : [];
        const hasFull = perms.length === 0;
        const canReport = hasFull || perms.includes("report");
        if (!canReport || !u.company_has_gambling) {
          navigate("/dashboard", { replace: true });
          return;
        }
        setMe(u);

        const compRes = await fetch(buildApiUrl("api/transactions/get_owner_companies_api.php?all=1"), { credentials: "include" });
        const compJson = await compRes.json();
        const rows = Array.isArray(compJson?.data) ? compJson.data : [];
        setCompanies(rows);

        const url = new URL(window.location.href);
        const queryCompany = url.searchParams.get("company_id");
        let effective = queryCompany || u.company_id || rows[0]?.id || null;
        effective = effective ? Number(effective) : null;

        setCompanyId(effective);
        
        const cur = rows.find((c) => Number(c.id) === Number(effective));
        const savedGroup = sessionStorage.getItem("dashboard_group_filter");
        const groups = [...new Set(rows.filter((c) => c.group_id).map((c) => String(c.group_id).toUpperCase().trim()))].sort();
        
        let selGroup = null;
        if (savedGroup && groups.includes(savedGroup) && cur?.group_id && String(cur.group_id).toUpperCase().trim() === savedGroup) {
          selGroup = savedGroup;
        } else if (savedGroup && !groups.includes(savedGroup)) {
          sessionStorage.removeItem("dashboard_group_filter");
        }
        if (!selGroup && cur?.group_id?.trim()) {
          selGroup = String(cur.group_id).toUpperCase().trim();
          sessionStorage.setItem("dashboard_group_filter", selGroup);
        }
    setSelectedGroup(selGroup);
    if (selGroup) sessionStorage.setItem("dashboard_group_filter", selGroup);


      } catch {
        navigate("/login", { replace: true });
      } finally {
        setBootLoading(false);
      }
    })();
  }, [navigate]);

  // -- Data Fetching --
  const loadReport = useCallback(async () => {
    if (!companyId || !dateFrom || !dateTo) return;
    setLoading(true);
    setError("");
    try {
      const data = await fetchCustomerReport({
        accountId,
        dateFrom,
        dateTo,
        showAll,
        companyId,
        selectedCurrencies,
        showAllCurrencies
      });
      setReportData(data);
    } catch (err) {
      setError(err.message);
      setReportData(null);
    } finally {
      setLoading(false);
    }
  }, [companyId, accountId, dateFrom, dateTo, showAll, selectedCurrencies, showAllCurrencies]);

  const loadMetaData = useCallback(async () => {
    if (!companyId) return;
    try {
      const [accs, curs] = await Promise.all([
        fetchAccounts(companyId),
        fetchCurrencies(companyId)
      ]);
      setAccounts(accs);
      setCurrencyList(curs);
      
      // Default currency selection logic from legacy
      if (curs.length > 0) {
        const myr = curs.find(c => c.code === "MYR");
        const def = myr || curs[0];
        setSelectedCurrencies([def.code]);
        setShowAllCurrencies(false);
      }
    } catch (err) {
      console.error("Meta data load error:", err);
    }
  }, [companyId]);

  useEffect(() => {
    if (!bootLoading && companyId) {
      loadMetaData();
    }
  }, [bootLoading, companyId, loadMetaData]);

  useEffect(() => {
    if (!bootLoading && companyId) {
      loadReport();
    }
  }, [bootLoading, companyId, accountId, dateFrom, dateTo, showAll, selectedCurrencies, showAllCurrencies, loadReport]);

  // -- Handlers --
  const onSwitchCompany = async (c) => {
    if (!c?.id || Number(c.id) === Number(companyId)) return;
    try {
      const res = await fetch(buildApiUrl(`api/session/update_company_session_api.php?company_id=${c.id}`), { credentials: "include" });
      const json = await res.json();
      if (!json.success) {
        notify(json.error || "Switch failed", "danger");
        return;
      }
      setCompanyId(Number(c.id));
      const newGroup = c.group_id ? String(c.group_id).toUpperCase().trim() : null;
      setSelectedGroup(newGroup);
      if (newGroup) {
        sessionStorage.setItem("dashboard_group_filter", newGroup);
      } else {
        sessionStorage.removeItem("dashboard_group_filter");
      }
      notifyCompanySessionUpdated();
    } catch {
      notify("Switch failed", "danger");
    }
  };

  const onGroupClick = (gid) => {
    if (selectedGroup === gid) {
      setSelectedGroup(null);
      sessionStorage.removeItem("dashboard_group_filter");
    } else {
      setSelectedGroup(gid);
      sessionStorage.setItem("dashboard_group_filter", gid);
    }
  };

  const toggleCurrency = (code) => {
    setShowAllCurrencies(false);
    setSelectedCurrencies(prev => {
      if (prev.includes(code)) return prev.filter(c => c !== code);
      return [...prev, code];
    });
  };

  const toggleAllCurrencies = () => {
    setShowAllCurrencies(!showAllCurrencies);
    if (!showAllCurrencies) setSelectedCurrencies([]);
  };

  const selectQuickRange = (range) => {
    const dates = quickRangeToDates(range);
    if (dates) {
      setDateFrom(dates.startDate);
      setDateTo(dates.endDate);
    }
    setQuickSelectOpen(false);
  };

  // -- Helpers --
  const filteredAccounts = useMemo(() => {
    if (!accountSearch.trim()) return accounts;
    const s = accountSearch.toLowerCase();
    return accounts.filter(a => 
      (a.account_id || "").toLowerCase().includes(s) || 
      (a.name || "").toLowerCase().includes(s) ||
      (a.display_text || "").toLowerCase().includes(s)
    );
  }, [accounts, accountSearch]);

  const selectedAccountLabel = useMemo(() => {
    if (!accountId) return "All Accounts";
    const found = accounts.find(a => String(a.id) === String(accountId));
    return found ? (found.display_text || `${found.account_id} - ${found.name}`) : "All Accounts";
  }, [accounts, accountId]);

  // -- Click Outside --
  useEffect(() => {
    const handle = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setQuickSelectOpen(false);
      if (accountDropdownRef.current && !accountDropdownRef.current.contains(e.target)) setAccountDropdownOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  // -- Rendering: Calendar --
  const buildCalendar = () => {
    const firstDay = new Date(calendarYear, calendarMonth - 1, 1);
    const offset = firstDay.getDay();
    const start = new Date(firstDay);
    start.setDate(firstDay.getDate() - offset);
    
    const cells = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const ymd = formatYmd(d);
      const isCurrent = d.getMonth() === calendarMonth - 1;
      const isSelected = ymd === dateFrom || ymd === dateTo;
      const inRange = ymd > dateFrom && ymd < dateTo;
      
      cells.push(
        <div 
          key={ymd} 
          className={`calendar-day ${!isCurrent ? "not-current" : ""} ${isSelected ? "selected" : ""} ${inRange ? "in-range" : ""}`}
          onClick={() => {
            if (!pendingStartDate) {
              setPendingStartDate(ymd);
              setDateFrom(ymd);
              setDateTo(ymd);
            } else {
              const [s, e] = [pendingStartDate, ymd].sort();
              setDateFrom(s);
              setDateTo(e);
              setPendingStartDate(null);
              setCalendarOpen(false);
            }
          }}
        >
          {d.getDate()}
        </div>
      );
    }
    return cells;
  };

  // -- Rendering: Report --
  const renderReportContent = () => {
    if (loading) return (
      <div className="customer-report-card">
        <div className="customer-report-card-item" style={{ textAlign: "center", padding: 20, gridColumn: "1 / -1" }}>Loading...</div>
      </div>
    );

    if (error) return (
      <div className="customer-report-card">
        <div className="customer-report-card-item" style={{ textAlign: "center", padding: 20, gridColumn: "1 / -1", color: "red" }}>{error}</div>
      </div>
    );

    if (!reportData || !reportData.data || reportData.data.length === 0) return (
      <div className="customer-report-card">
        <div className="customer-report-card-item" style={{ textAlign: "center", padding: 20, gridColumn: "1 / -1" }}>No data found</div>
      </div>
    );

    const data = reportData.data;
    
    // Grouping Logic
    const grouped = {};
    data.forEach(item => {
      const c = item.currency || "null";
      if (!grouped[c]) grouped[c] = [];
      grouped[c].push(item);
    });

    const currenciesInReport = Object.keys(grouped).filter(c => c !== "null").sort();
    const hasNull = !!grouped["null"];

    // If multiple currencies or null+one, show grouped
    if (currenciesInReport.length > 1 || (currenciesInReport.length === 1 && hasNull)) {
      return (
        <div id="currency-grouped-reports-container">
          {currenciesInReport.map(c => {
            const items = grouped[c];
            const win = items.reduce((acc, cur) => acc + parseFloat(cur.win || 0), 0);
            const lose = items.reduce((acc, cur) => acc + parseFloat(cur.lose || 0), 0);
            return (
              <div key={c} className="customer-report-currency-section" style={{ marginBottom: 30 }}>
                <h3 style={{ margin: "20px 0 10px 0", fontSize: "clamp(14px, 1.2vw, 18px)", fontWeight: "bold", color: "#1f2937" }}>
                  Currency: {c.toUpperCase()}
                </h3>
                <div className="customer-report-table-header">
                  <div>Account</div><div>Name</div><div>Currency</div><div>Win</div><div>Lose</div>
                </div>
                <div className="customer-report-cards">
                  {items.map((it, idx) => (
                    <div key={idx} className="customer-report-card">
                      <div className="customer-report-card-item">{(it.account_id || "").toUpperCase()}</div>
                      <div className="customer-report-card-item">{(it.name || "").toUpperCase()}</div>
                      <div className="customer-report-card-item">{(it.currency || "-").toUpperCase()}</div>
                      <div className="customer-report-card-item customer-report-amount win">{formatAmount(it.win)}</div>
                      <div className="customer-report-card-item customer-report-amount lose">{formatAmount(it.lose)}</div>
                    </div>
                  ))}
                </div>
                <div className="customer-report-total">
                  <div className="customer-report-total-label">Total:</div>
                  <div className="customer-report-amount win customer-report-total-win">{formatAmount(win)}</div>
                  <div className="customer-report-amount lose customer-report-total-lose">{formatAmount(lose)}</div>
                </div>
              </div>
            );
          })}
          {hasNull && (
            <div className="customer-report-currency-section" style={{ marginBottom: 30 }}>
              <h3 style={{ margin: "20px 0 10px 0", fontSize: "clamp(14px, 1.2vw, 18px)", fontWeight: "bold", color: "#1f2937" }}>
                Currency: -
              </h3>
              <div className="customer-report-table-header">
                <div>Account</div><div>Name</div><div>Currency</div><div>Win</div><div>Lose</div>
              </div>
              <div className="customer-report-cards">
                {grouped["null"].map((it, idx) => (
                  <div key={idx} className="customer-report-card">
                    <div className="customer-report-card-item">{(it.account_id || "").toUpperCase()}</div>
                    <div className="customer-report-card-item">{(it.name || "").toUpperCase()}</div>
                    <div className="customer-report-card-item">-</div>
                    <div className="customer-report-card-item customer-report-amount win">{formatAmount(it.win)}</div>
                    <div className="customer-report-card-item customer-report-amount lose">{formatAmount(it.lose)}</div>
                  </div>
                ))}
              </div>
              <div className="customer-report-total">
                <div className="customer-report-total-label">Total:</div>
                <div className="customer-report-amount win customer-report-total-win">
                  {formatAmount(grouped["null"].reduce((acc, cur) => acc + parseFloat(cur.win || 0), 0))}
                </div>
                <div className="customer-report-amount lose customer-report-total-lose">
                  {formatAmount(grouped["null"].reduce((acc, cur) => acc + parseFloat(cur.lose || 0), 0))}
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    // Default view (Single currency or no currency)
    return (
      <div id="default-report-container">
        <div className="customer-report-table-header">
          <div>Account</div><div>Name</div><div>Currency</div><div>Win</div><div>Lose</div>
        </div>
        <div className="customer-report-cards">
          {data.map((it, idx) => (
            <div key={idx} className="customer-report-card">
              <div className="customer-report-card-item">{(it.account_id || "").toUpperCase()}</div>
              <div className="customer-report-card-item">{(it.name || "").toUpperCase()}</div>
              <div className="customer-report-card-item">{(it.currency || "-").toUpperCase()}</div>
              <div className="customer-report-card-item customer-report-amount win">{formatAmount(it.win)}</div>
              <div className="customer-report-card-item customer-report-amount lose">{formatAmount(it.lose)}</div>
            </div>
          ))}
        </div>
        <div className="customer-report-total">
          <div className="customer-report-total-label">Total:</div>
          <div className="customer-report-amount win customer-report-total-win">{formatAmount(reportData.total_win)}</div>
          <div className="customer-report-amount lose customer-report-total-lose">{formatAmount(reportData.total_lose)}</div>
        </div>
      </div>
    );
  };

  if (bootLoading || !me) return null;

  const snapCompanies = companies.filter((c) => c.company_id && String(c.company_id).trim() !== "");
  const snapGroupIds = [...new Set(snapCompanies.filter((c) => c.group_id).map((c) => String(c.group_id).toUpperCase().trim()))].sort();

  return (
    <div className="container">
      <div className="content">
        <div className="report-header">
          <h1 className="account-page-title">Customer Report</h1>
        </div>
        <div className="account-separator-line" />

        <div className="customer-report-filter-container">
          <div className="customer-report-filters">
            {/* Account Select */}
            <div className="customer-report-filter-group">
              <label>Account</label>
              <div className="custom-select-wrapper" ref={accountDropdownRef}>
                <button 
                  type="button" 
                  className={`custom-select-button ${accountDropdownOpen ? "open" : ""}`}
                  onClick={() => setAccountDropdownOpen(!accountDropdownOpen)}
                >
                  {selectedAccountLabel}
                </button>
                {accountDropdownOpen && (
                  <div className="custom-select-dropdown show">
                    <div className="custom-select-search">
                      <input 
                        type="text" 
                        placeholder="Search account..." 
                        autoComplete="off" 
                        value={accountSearch}
                        onChange={(e) => setAccountSearch(e.target.value)}
                        autoFocus
                      />
                    </div>
                    <div className="custom-select-options">
                      <div 
                        className={`custom-select-option ${!accountId ? "selected" : ""}`}
                        onClick={() => { setAccountId(""); setAccountDropdownOpen(false); }}
                      >
                        All Accounts
                      </div>
                      {filteredAccounts.map(a => (
                        <div 
                          key={a.id} 
                          className={`custom-select-option ${String(a.id) === String(accountId) ? "selected" : ""}`}
                          onClick={() => { setAccountId(a.id); setAccountDropdownOpen(false); }}
                        >
                          {a.display_text || `${a.account_id} - ${a.name}`}
                        </div>
                      ))}
                      {filteredAccounts.length === 0 && (
                        <div className="custom-select-no-results">No results found</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Date Range Picker */}
            <div className="customer-report-filter-group report-date-range-group">
              <label>Date Range</label>
              <div 
                className="report-date-range-picker" 
                onClick={() => setCalendarOpen(!calendarOpen)}
              >
                <i className="fas fa-calendar-alt" />
                <span className="report-date-range-input">
                  {formatDmy(parseYmd(dateFrom))} - {formatDmy(parseYmd(dateTo))}
                </span>
              </div>
            </div>

            {/* Quick Select & Show All */}
            <div className="customer-report-quick-and-showall">
              <div className="customer-report-filter-group quick-select-wrap" ref={dropdownRef}>
                <label className="form-label">
                  <i className="fas fa-clock" /> Quick Select
                </label>
                <div className="quick-select-dropdown quick-select-dropdown-toggle">
                  <button
                    type="button"
                    className="dropdown-toggle"
                    onClick={(e) => { e.stopPropagation(); setQuickSelectOpen(!quickSelectOpen); }}
                  >
                    <i className="fas fa-calendar-alt" />
                    <span id="quick-select-text">Period</span>
                    <i className="fas fa-chevron-down" />
                  </button>
                  {quickSelectOpen && (
                    <div className="dropdown-menu" style={{ display: "block" }}>
                      {["today", "yesterday", "thisWeek", "lastWeek", "thisMonth", "lastMonth", "thisYear", "lastYear"].map(r => (
                        <button key={r} type="button" className="dropdown-item" onClick={() => selectQuickRange(r)}>
                          {r.replace(/([A-Z])/g, " $1").replace(/^./, str => str.toUpperCase())}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="customer-report-filter-group customer-report-showall-group">
                <div className="customer-report-checkbox-section">
                  <label className="transaction-checkbox-label">
                    <input 
                      type="checkbox" 
                      className="transaction-checkbox" 
                      checked={showAll}
                      onChange={(e) => setShowAll(e.target.checked)}
                    />
                    Show All
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Group & Company Buttons */}
          {snapGroupIds.length > 0 && (
            <div className="transaction-company-filter shared-group-wrapper" style={{ marginTop: 15 }}>
              <span className="transaction-company-label">GroupID:</span>
              <div className="transaction-company-buttons">
                {snapGroupIds.map((gid) => (
                  <button 
                    key={gid} 
                    type="button" 
                    className={`transaction-company-btn shared-group-btn ${selectedGroup === gid ? "active" : ""}`}
                    onClick={() => onGroupClick(gid)}
                  >
                    {gid}
                  </button>
                ))}
              </div>
            </div>
          )}

          {snapCompanies.length > 0 && (
            <div className="transaction-company-filter shared-company-wrapper" style={{ marginTop: 10 }}>
              <span className="transaction-company-label">Company:</span>
              <div className="transaction-company-buttons">
                {snapCompanies.map((comp) => (
                  <button
                    key={comp.id}
                    type="button"
                    style={companyButtonStyle(comp, selectedGroup)}
                    className={`transaction-company-btn shared-company-btn ${Number(comp.id) === Number(companyId) ? "active" : ""}`}
                    onClick={() => onSwitchCompany(comp)}
                  >
                    {comp.company_id}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Currency Buttons */}
          {currencyList.length > 0 && (
            <div className="transaction-company-filter" style={{ marginTop: 10 }}>
              <span className="transaction-company-label">Currency:</span>
              <div className="transaction-company-buttons">
                <button 
                  type="button" 
                  className={`transaction-company-btn ${showAllCurrencies ? "active" : ""}`}
                  onClick={toggleAllCurrencies}
                >
                  All
                </button>
                {currencyList.map(c => (
                  <button 
                    key={c.code} 
                    type="button" 
                    className={`transaction-company-btn ${selectedCurrencies.includes(c.code) ? "active" : ""}`}
                    onClick={() => toggleCurrency(c.code)}
                  >
                    {c.code}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Report List */}
        <div className="customer-report-list-container">
          {renderReportContent()}
        </div>
      </div>

      {/* Notifications */}
      {toast && (
        <div id="customerReportNotificationContainer" className="account-notification-container">
          <div className={`account-notification account-notification-${toast.type} show`}>
            {toast.message}
          </div>
        </div>
      )}

      {/* Calendar Popup */}
      {calendarOpen && (
        <div className="calendar-popup" style={{ display: "block", top: "45%", left: "50%", transform: "translate(-50%, -50%)", position: "fixed" }}>
          <div className="calendar-header">
            <button type="button" className="calendar-nav-btn" onClick={() => {
              if (calendarMonth === 1) { setCalendarMonth(12); setCalendarYear(calendarYear - 1); }
              else setCalendarMonth(calendarMonth - 1);
            }}>
              <i className="fas fa-chevron-left" />
            </button>
            <div className="calendar-month-year">
              <select value={calendarMonth - 1} onChange={(e) => setCalendarMonth(parseInt(e.target.value) + 1)}>
                {["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map((m, i) => (
                  <option key={m} value={i}>{m}</option>
                ))}
              </select>
              <select value={calendarYear} onChange={(e) => setCalendarYear(parseInt(e.target.value))}>
                {Array.from({ length: 10 }, (_, i) => today.getFullYear() - 5 + i).map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <button type="button" className="calendar-nav-btn" onClick={() => {
              if (calendarMonth === 12) { setCalendarMonth(1); setCalendarYear(calendarYear + 1); }
              else setCalendarMonth(calendarMonth + 1);
            }}>
              <i className="fas fa-chevron-right" />
            </button>
          </div>
          <div className="calendar-weekdays">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => <div key={d} className="calendar-weekday">{d}</div>)}
          </div>
          <div className="calendar-days">
            {buildCalendar()}
          </div>
          <div style={{ padding: 10, textAlign: "center" }}>
            <button className="btn btn-primary" onClick={() => setCalendarOpen(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
