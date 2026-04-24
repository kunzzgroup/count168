import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { notifyCompanySessionUpdated } from "../utils/companySessionEvents.js";
import { assetUrl, buildApiUrl } from "../utils/apiUrl.js";

function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    const safe = src.replace(/"/g, "");
    const existing = document.querySelector(`script[data-dr-script="${safe}"]`);
    if (existing) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = false;
    s.dataset.drScript = safe;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.body.appendChild(s);
  });
}

function injectStylesheet(href) {
  return new Promise((resolve) => {
    const existing = document.querySelector(`link[rel="stylesheet"][href="${href}"]`);
    if (existing) {
      resolve();
      return;
    }
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.onload = () => resolve();
    link.onerror = () => resolve();
    document.head.appendChild(link);
  });
}

function companyButtonStyle(comp, snapGroup) {
  const cGid = comp.group_id != null ? String(comp.group_id).toUpperCase().trim() : "";
  if (snapGroup) {
    return cGid === snapGroup ? {} : { display: "none" };
  }
  return cGid ? { display: "none" } : {};
}

function formatDmy(d) {
  const day = String(d.getDate()).padStart(2, "0");
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const y = d.getFullYear();
  return `${day}/${m}/${y}`;
}

export default function DomainReportPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [filterSnapshot, setFilterSnapshot] = useState(null);
  const today = useMemo(() => formatDmy(new Date()), []);

  useLayoutEffect(() => {
    document.body.classList.remove("bg", "account-page", "announcement-page", "datacapture-page", "transaction-page");
    document.body.classList.add("dashboard-page", "report-page");
    return () => {
      document.body.classList.remove("report-page");
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [meRes, companiesRes] = await Promise.all([
          fetch(buildApiUrl("api/session/current_user_api.php"), { credentials: "include" }),
          fetch(buildApiUrl("api/transactions/get_owner_companies_api.php?all=1"), { credentials: "include" }),
        ]);
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
          if (!cancelled) setForbidden(true);
          return;
        }

        const companiesJson = await companiesRes.json();
        const rows = Array.isArray(companiesJson?.data) ? companiesJson.data : [];

        const url = new URL(window.location.href);
        const queryCompany = url.searchParams.get("company_id");
        let effective = queryCompany || u.company_id || rows[0]?.id || null;
        effective = effective ? Number(effective) : null;

        if (queryCompany && rows.some((c) => Number(c.id) === Number(queryCompany))) {
          const sync = await fetch(buildApiUrl(`api/session/update_company_session_api.php?company_id=${queryCompany}`), {
            credentials: "include",
          });
          const sj = await sync.json();
          if (!sync.ok || !sj.success) {
            effective = u.company_id ? Number(u.company_id) : rows[0]?.id ? Number(rows[0].id) : null;
          } else {
            notifyCompanySessionUpdated();
          }
        }

        const current = rows.find((c) => Number(c.id) === Number(effective));
        const savedGroup = sessionStorage.getItem("dashboard_group_filter");
        const groups = [...new Set(rows.filter((c) => c.group_id).map((c) => String(c.group_id).toUpperCase().trim()))].sort();
        let selGroup = null;
        if (savedGroup && groups.includes(savedGroup) && current?.group_id && String(current.group_id).toUpperCase().trim() === savedGroup) {
          selGroup = savedGroup;
        } else if (savedGroup && !groups.includes(savedGroup)) {
          sessionStorage.removeItem("dashboard_group_filter");
        }
        if (!selGroup && current?.group_id?.trim()) {
          selGroup = String(current.group_id).toUpperCase().trim();
          sessionStorage.setItem("dashboard_group_filter", selGroup);
        }

        if (!cancelled) {
          const snapRows = rows.filter((c) => c.company_id && String(c.company_id).trim() !== "");
          setFilterSnapshot({
            companyId: effective,
            selectedGroup: selGroup,
            snapCompanies: snapRows,
            snapGroupIds: [...new Set(snapRows.filter((c) => c.group_id).map((c) => String(c.group_id).toUpperCase().trim()))].sort(),
          });
        }
      } catch {
        if (!cancelled) navigate("/login", { replace: true });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const bootstrapVanilla = useCallback(async (snap) => {
    window.DOMAIN_REPORT_COMPANY_ID = snap.companyId;
    window.__DOMAIN_REPORT_SPA_MODE = true;
    window.__drApiHref = (path) => buildApiUrl(String(path || "").replace(/^\//, ""));
    window._sharedCompanyFilterInitialized = false;

    await injectStylesheet("https://fonts.googleapis.com/css2?family=Amaranth:wght@400;700&display=swap");
    await injectStylesheet("https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css");
    await injectStylesheet(assetUrl("css/accountCSS.css"));
    await injectStylesheet(assetUrl("css/transaction.css"));
    await injectStylesheet(assetUrl("css/date-range-picker.css"));
    await injectStylesheet(assetUrl("css/domain_report.css"));
    await injectStylesheet(assetUrl("css/global-13inch.css"));

    await loadScriptOnce(assetUrl("js/date-range-picker.js"));
    await loadScriptOnce(assetUrl("js/shared_company_filter.js"));
    window.__initSharedCompanyFilter?.();
    await loadScriptOnce(assetUrl("js/domain_report.js"));

    window.onSharedCompanyFilterChanged = (companyId, companyCode) => {
      if (typeof window.switchCompany === "function") {
        window.switchCompany(companyId, companyCode);
      }
    };
    await window.__initDomainReportPage?.();
  }, []);

  useEffect(() => {
    if (loading || forbidden || !filterSnapshot) return;
    let cancelled = false;
    (async () => {
      try {
        if (cancelled) return;
        await bootstrapVanilla(filterSnapshot);
      } catch (e) {
        console.error(e);
      }
    })();
    return () => {
      cancelled = true;
      const processSelectBtn = document.getElementById("processSelect");
      if (processSelectBtn) {
        processSelectBtn.removeAttribute("data-dr-spa-init");
      }
      window.__DOMAIN_REPORT_SPA_MODE = false;
    };
  }, [loading, forbidden, filterSnapshot, bootstrapVanilla]);

  if (forbidden) return <Navigate to="/dashboard" replace />;
  if (loading || !filterSnapshot) return null;

  const fs = filterSnapshot;

  return (
    <div className="container">
      <div className="content">
        <div className="report-header">
          <h1 className="account-page-title">Domain Report</h1>
        </div>
        <div className="account-separator-line" />

        <div className="domain-report-filter-container">
          <div className="domain-report-filters">
            <div className="domain-report-filter-group">
              <label htmlFor="processSelect">Process</label>
              <div className="custom-select-wrapper">
                <button type="button" className="custom-select-button" id="processSelect" data-placeholder="All Process">
                  All Process
                </button>
                <div className="custom-select-dropdown" id="processSelect_dropdown">
                  <div className="custom-select-search">
                    <input type="text" placeholder="Search process..." autoComplete="off" />
                  </div>
                  <div className="custom-select-options" />
                </div>
              </div>
            </div>
            <div className="domain-report-filter-group report-date-range-group">
              <label htmlFor="date-range-picker">Date Range</label>
              <div className="date-range-picker" id="date-range-picker">
                <i className="fas fa-calendar-alt" />
                <span id="date-range-display">Select date range</span>
              </div>
              <input type="hidden" id="date_from" defaultValue={today} />
              <input type="hidden" id="date_to" defaultValue={today} />
            </div>
            <div className="domain-report-filter-group quick-select-wrap">
              <label className="form-label">
                <i className="fas fa-clock" /> Quick Select
              </label>
              <div className="quick-select-dropdown quick-select-dropdown-toggle">
                <button
                  type="button"
                  className="dropdown-toggle"
                  onClick={(e) => {
                    e.stopPropagation();
                    window.toggleQuickSelectDropdown?.();
                  }}
                >
                  <i className="fas fa-calendar-alt" />
                  <span id="quick-select-text">Period</span>
                  <i className="fas fa-chevron-down" />
                </button>
                <div className="dropdown-menu" id="quick-select-dropdown">
                  <button type="button" className="dropdown-item" onClick={() => window.selectQuickRange?.("today")}>Today</button>
                  <button type="button" className="dropdown-item" onClick={() => window.selectQuickRange?.("yesterday")}>Yesterday</button>
                  <button type="button" className="dropdown-item" onClick={() => window.selectQuickRange?.("thisWeek")}>This Week</button>
                  <button type="button" className="dropdown-item" onClick={() => window.selectQuickRange?.("lastWeek")}>Last Week</button>
                  <button type="button" className="dropdown-item" onClick={() => window.selectQuickRange?.("thisMonth")}>This Month</button>
                  <button type="button" className="dropdown-item" onClick={() => window.selectQuickRange?.("lastMonth")}>Last Month</button>
                  <button type="button" className="dropdown-item" onClick={() => window.selectQuickRange?.("thisYear")}>This Year</button>
                  <button type="button" className="dropdown-item" onClick={() => window.selectQuickRange?.("lastYear")}>Last Year</button>
                </div>
              </div>
            </div>
          </div>

          {fs.snapGroupIds.length > 0 && (
            <div id="group-buttons-wrapper" className="transaction-company-filter shared-group-wrapper">
              <span className="transaction-company-label">GroupID:</span>
              <div id="group-buttons-container" className="transaction-company-buttons">
                {fs.snapGroupIds.map((gid) => (
                  <button key={gid} type="button" className={`transaction-company-btn shared-group-btn ${fs.selectedGroup === gid ? "active" : ""}`} data-group-id={gid}>
                    {gid}
                  </button>
                ))}
              </div>
            </div>
          )}

          {fs.snapCompanies.length > 0 && (
            <div id="company-buttons-wrapper" className="transaction-company-filter shared-company-wrapper">
              <span className="transaction-company-label">Company:</span>
              <div id="company-buttons-container" className="transaction-company-buttons">
                {fs.snapCompanies.map((comp) => (
                  <button
                    key={comp.id}
                    type="button"
                    style={companyButtonStyle(comp, fs.selectedGroup)}
                    className={`transaction-company-btn shared-company-btn ${Number(comp.id) === Number(fs.companyId) ? "active" : ""}`}
                    data-company-id={comp.id}
                    data-group-id={comp.group_id != null ? String(comp.group_id).toUpperCase().trim() : ""}
                    data-company-code={comp.company_id}
                  >
                    {comp.company_id}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="domain-report-list-container">
          <div className="domain-report-table-header">
            <div>Process</div>
            <div>Turnover</div>
            <div>Win</div>
            <div>Lose</div>
            <div>Win/Lose</div>
          </div>

          <div className="domain-report-cards" id="domainReportBody">
            <div className="domain-report-card">
              <div className="domain-report-card-item" style={{ gridColumn: "1 / -1", textAlign: "center", justifyContent: "center", padding: 20 }}>
                Loading...
              </div>
            </div>
          </div>

          <div className="domain-report-total" id="domainReportTotal" style={{ display: "none" }}>
            <div className="domain-report-total-label">Total</div>
            <div className="domain-report-amount" id="totalTurnover">0.00</div>
            <div className="domain-report-amount" id="totalWin">0.00</div>
            <div className="domain-report-amount" id="totalLose">0.00</div>
            <div className="domain-report-amount" id="totalWinLose">0.00</div>
          </div>
        </div>
      </div>

      <div id="domainReportNotificationContainer" className="account-notification-container" />

      <div className="calendar-popup" id="calendar-popup" style={{ display: "none" }}>
        <div className="calendar-header">
          <button type="button" className="calendar-nav-btn" onClick={(e) => { e.stopPropagation(); window.changeMonth?.(-1); }}>
            <i className="fas fa-chevron-left" />
          </button>
          <div className="calendar-month-year" onClick={(e) => e.stopPropagation()}>
            <select id="calendar-month-select" defaultValue="0">
              <option value="0">Jan</option><option value="1">Feb</option><option value="2">Mar</option><option value="3">Apr</option>
              <option value="4">May</option><option value="5">Jun</option><option value="6">Jul</option><option value="7">Aug</option>
              <option value="8">Sep</option><option value="9">Oct</option><option value="10">Nov</option><option value="11">Dec</option>
            </select>
            <select id="calendar-year-select" />
          </div>
          <button type="button" className="calendar-nav-btn" onClick={(e) => { e.stopPropagation(); window.changeMonth?.(1); }}>
            <i className="fas fa-chevron-right" />
          </button>
        </div>
        <div className="calendar-weekdays">
          <div className="calendar-weekday">Sun</div><div className="calendar-weekday">Mon</div><div className="calendar-weekday">Tue</div>
          <div className="calendar-weekday">Wed</div><div className="calendar-weekday">Thu</div><div className="calendar-weekday">Fri</div><div className="calendar-weekday">Sat</div>
        </div>
        <div className="calendar-days" id="calendar-days" />
      </div>
    </div>
  );
}
