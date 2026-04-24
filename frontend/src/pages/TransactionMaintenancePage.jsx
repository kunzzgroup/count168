import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { assetUrl, buildApiUrl } from "../utils/apiUrl.js";

function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    const safe = src.replace(/"/g, "");
    const existing = document.querySelector(`script[data-tm-script="${safe}"]`);
    if (existing) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.async = false;
    s.dataset.tmScript = safe;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.body.appendChild(s);
  });
}

function injectStylesheet(href) {
  return new Promise((resolve) => {
    const existing = document.querySelector(`link[rel="stylesheet"][href="${href}"]`);
    if (existing) return resolve();
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
  if (snapGroup) return cGid === snapGroup ? {} : { display: "none" };
  return cGid ? { display: "none" } : {};
}

function formatDmy(d) {
  const day = String(d.getDate()).padStart(2, "0");
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const y = d.getFullYear();
  return `${day}/${m}/${y}`;
}

export default function TransactionMaintenancePage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [snapshot, setSnapshot] = useState(null);
  const today = useMemo(() => formatDmy(new Date()), []);

  useLayoutEffect(() => {
    document.body.classList.remove("bg");
    document.body.classList.add("dashboard-page");
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
        if (!meRes.ok || !meJson.success || !meJson.data) return navigate("/login", { replace: true });
        const u = meJson.data;
        const perms = Array.isArray(u.permissions) ? u.permissions : [];
        const canMaintenance = perms.length === 0 || perms.includes("maintenance");
        if (!canMaintenance || !u.company_has_gambling) {
          if (!cancelled) setForbidden(true);
          return;
        }
        const companiesJson = await companiesRes.json();
        const rows = Array.isArray(companiesJson?.data) ? companiesJson.data : [];
        const current = rows.find((c) => Number(c.id) === Number(u.company_id));
        const savedGroup = sessionStorage.getItem("dashboard_group_filter");
        const groups = [...new Set(rows.filter((c) => c.group_id).map((c) => String(c.group_id).toUpperCase().trim()))].sort();
        let selGroup = null;
        if (savedGroup && groups.includes(savedGroup) && current?.group_id && String(current.group_id).toUpperCase().trim() === savedGroup) selGroup = savedGroup;
        if (!selGroup && current?.group_id?.trim()) selGroup = String(current.group_id).toUpperCase().trim();
        if (!cancelled) {
          const snapRows = rows.filter((c) => c.company_id && String(c.company_id).trim() !== "");
          setSnapshot({
            companyId: u.company_id ? Number(u.company_id) : null,
            companyCode: current?.company_id || "",
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
    return () => { cancelled = true; };
  }, [navigate]);

  const bootstrap = useCallback(async (snap) => {
    window.TRANSACTION_MAINTENANCE = { currentCompanyId: snap.companyId, currentCompanyCode: snap.companyCode || "" };
    window.__TRANSACTION_MAINTENANCE_SPA_MODE = true;
    window.__tmApiHref = (path) => buildApiUrl(String(path || "").replace(/^\//, ""));
    window._sharedCompanyFilterInitialized = false;

    await injectStylesheet("https://fonts.googleapis.com/css?family=Amaranth");
    await injectStylesheet("https://fonts.googleapis.com/css2?family=Amaranth:wght@400;700&display=swap");
    await injectStylesheet("https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css");
    await injectStylesheet(assetUrl("css/accountCSS.css"));
    await injectStylesheet(assetUrl("css/transaction_maintenance.css"));
    await injectStylesheet(assetUrl("css/date-range-picker.css"));
    await injectStylesheet(assetUrl("css/global-13inch.css"));

    await loadScriptOnce(assetUrl("js/date-range-picker.js"));
    await loadScriptOnce(assetUrl("js/shared_company_filter.js"));
    window.__initSharedCompanyFilter?.();
    await loadScriptOnce(assetUrl("js/transaction_maintenance.js"));
    window.onSharedCompanyFilterChanged = (companyId, companyCode) => window.switchCompany?.(companyId, companyCode);
    await window.__initTransactionMaintenancePage?.();
  }, []);

  useEffect(() => {
    if (loading || forbidden || !snapshot) return;
    bootstrap(snapshot).catch(console.error);
  }, [loading, forbidden, snapshot, bootstrap]);

  if (forbidden) return <Navigate to="/dashboard" replace />;
  if (loading || !snapshot) return null;
  const fs = snapshot;

  return (
    <div className="container">
      <div className="maintenance-header">
        <h1 id="maintenance-page-title">Maintenance - Transaction</h1>
        <div id="maintenance-permission-filter" className="maintenance-permission-filter-header" style={{ display: "none" }}>
          <span className="maintenance-company-label">Category:</span>
          <div id="maintenance-permission-buttons" className="maintenance-company-buttons" />
        </div>
      </div>
      <div className="maintenance-search-section">
        <div className="maintenance-filters">
          <div className="maintenance-form-group">
            <label className="maintenance-label">Process</label>
            <div className="custom-select-wrapper">
              <button type="button" className="custom-select-button" id="filter_process" data-placeholder="--Select All--">--Select All--</button>
              <div className="custom-select-dropdown" id="filter_process_dropdown"><div className="custom-select-search"><input type="text" placeholder="Search process..." autoComplete="off" /></div><div className="custom-select-options" /></div>
            </div>
          </div>
          <div className="maintenance-form-group">
            <label className="maintenance-label">Date Range</label>
            <div className="date-range-picker" id="date-range-picker"><i className="fas fa-calendar-alt" /><span id="date-range-display">Select date range</span></div>
            <input type="hidden" id="date_from" defaultValue={today} />
            <input type="hidden" id="date_to" defaultValue={today} />
          </div>
          <div className="maintenance-form-group quick-select-wrap">
            <label className="form-label"><i className="fas fa-clock" /> Quick Select</label>
            <div className="quick-select-dropdown quick-select-dropdown-toggle">
              <button type="button" className="dropdown-toggle" onClick={(e) => { e.stopPropagation(); window.toggleQuickSelectDropdown?.(); }}><i className="fas fa-calendar-alt" /><span id="quick-select-text">Period</span><i className="fas fa-chevron-down" /></button>
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
        <div className="maintenance-filter-row">
          <div className="maintenance-filter-left">
            {fs.snapGroupIds.length > 0 && <div id="group-buttons-wrapper" className="transaction-company-filter shared-group-wrapper"><span className="transaction-company-label">GroupID:</span><div id="group-buttons-container" className="transaction-company-buttons">{fs.snapGroupIds.map((gid) => <button key={gid} type="button" className={`transaction-company-btn shared-group-btn ${fs.selectedGroup === gid ? "active" : ""}`} data-group-id={gid}>{gid}</button>)}</div></div>}
            {fs.snapCompanies.length > 0 && <div id="company-buttons-wrapper" className="transaction-company-filter shared-company-wrapper"><span className="transaction-company-label">Company:</span><div id="company-buttons-container" className="transaction-company-buttons">{fs.snapCompanies.map((comp) => <button key={comp.id} type="button" style={companyButtonStyle(comp, fs.selectedGroup)} className={`transaction-company-btn shared-company-btn ${Number(comp.id) === Number(fs.companyId) ? "active" : ""}`} data-company-id={comp.id} data-group-id={comp.group_id != null ? String(comp.group_id).toUpperCase().trim() : ""} data-company-code={comp.company_id}>{comp.company_id}</button>)}</div></div>}
          </div>
          <div className="maintenance-actions" />
        </div>
      </div>
      <div className="maintenance-list-container" id="tableContainer" style={{ display: "none" }}>
        <table className="maintenance-table"><thead><tr><th>No.</th><th>Created At</th><th>Process</th><th>Id_Product</th><th>Account</th><th>Description</th><th>Remark</th><th>Percent</th><th>Currency</th><th>Rate</th><th>Cr</th><th>Dr</th><th>Submitter</th></tr></thead><tbody id="dataTableBody" /></table>
      </div>
      <div className="empty-state-container" id="emptyState" style={{ display: "none" }}><div className="empty-state"><p>No data found. Please adjust your search criteria and try again.</p></div></div>
      <div id="notificationContainer" className="maintenance-notification-container" />
      <div className="calendar-popup" id="calendar-popup" style={{ display: "none" }}>
        <div className="calendar-header">
          <button type="button" className="calendar-nav-btn" onClick={(e) => { e.stopPropagation(); window.changeMonth?.(-1); }}><i className="fas fa-chevron-left" /></button>
          <div className="calendar-month-year" onClick={(e) => e.stopPropagation()}><select id="calendar-month-select" defaultValue="0"><option value="0">Jan</option><option value="1">Feb</option><option value="2">Mar</option><option value="3">Apr</option><option value="4">May</option><option value="5">Jun</option><option value="6">Jul</option><option value="7">Aug</option><option value="8">Sep</option><option value="9">Oct</option><option value="10">Nov</option><option value="11">Dec</option></select><select id="calendar-year-select" /></div>
          <button type="button" className="calendar-nav-btn" onClick={(e) => { e.stopPropagation(); window.changeMonth?.(1); }}><i className="fas fa-chevron-right" /></button>
        </div>
        <div className="calendar-weekdays"><div className="calendar-weekday">Sun</div><div className="calendar-weekday">Mon</div><div className="calendar-weekday">Tue</div><div className="calendar-weekday">Wed</div><div className="calendar-weekday">Thu</div><div className="calendar-weekday">Fri</div><div className="calendar-weekday">Sat</div></div>
        <div className="calendar-days" id="calendar-days" />
      </div>
    </div>
  );
}
