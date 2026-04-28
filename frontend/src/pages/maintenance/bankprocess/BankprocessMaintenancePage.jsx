import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { assetUrl, buildApiUrl } from "../../../utils/apiUrl.js";

function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    const safe = src.replace(/"/g, "");
    const existing = document.querySelector(`script[data-bpm-script="${safe}"]`);
    if (existing) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.async = false;
    s.dataset.bpmScript = safe;
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

export default function BankprocessMaintenancePage() {
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
        if (!canMaintenance || !u.company_has_bank) {
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
          setSnapshot({ companyId: u.company_id ? Number(u.company_id) : null, selectedGroup: selGroup, snapCompanies: snapRows, snapGroupIds: [...new Set(snapRows.filter((c) => c.group_id).map((c) => String(c.group_id).toUpperCase().trim()))].sort() });
        }
      } catch {
        if (!cancelled) navigate("/login", { replace: true });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [navigate]);

  const bootstrap = useCallback(async () => {
    window.__BANKPROCESS_MAINTENANCE_SPA_MODE = true;
    window.__bpmApiHref = (path) => buildApiUrl(String(path || "").replace(/^\//, ""));
    window._sharedCompanyFilterInitialized = false;

    await injectStylesheet("https://fonts.googleapis.com/css?family=Amaranth");
    await injectStylesheet("https://fonts.googleapis.com/css2?family=Amaranth:wght@400;700&display=swap");
    await injectStylesheet("https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css");
    await injectStylesheet(assetUrl("css/accountCSS.css"));
    await injectStylesheet(assetUrl("css/bankprocess_maintenance.css"));
    await injectStylesheet(assetUrl("css/date-range-picker.css"));
    await injectStylesheet(assetUrl("css/global-13inch.css"));

    await loadScriptOnce(assetUrl("js/date-range-picker.js"));
    await loadScriptOnce(assetUrl("js/shared_company_filter.js"));
    window.__initSharedCompanyFilter?.();
    await loadScriptOnce(assetUrl("js/bankprocess_maintenance.js"));
    window.onSharedCompanyFilterChanged = (companyId, companyCode) => window.switchCompany?.(companyId, companyCode);
    await window.__initBankprocessMaintenancePage?.();
  }, []);

  useEffect(() => {
    if (loading || forbidden || !snapshot) return;
    window.currentCompanyId = snapshot.companyId;
    bootstrap().catch(console.error);
  }, [loading, forbidden, snapshot, bootstrap]);

  if (forbidden) return <Navigate to="/dashboard" replace />;
  if (loading || !snapshot) return null;
  const fs = snapshot;

  return (
    <div className="container">
      <div className="maintenance-header">
        <h1 id="maintenance-page-title">Maintenance - Process</h1>
        <div id="bankprocess-permission-filter" className="maintenance-permission-filter-header" style={{ display: "none" }}><span className="maintenance-company-label">Category:</span><div id="bankprocess-permission-buttons" className="maintenance-company-buttons" /></div>
      </div>
      <div className="maintenance-search-section">
        <div className="maintenance-filters">
          <div className="maintenance-form-group maintenance-date-inline"><label className="maintenance-label">Date Range</label><div className="date-range-picker" id="date-range-picker"><i className="fas fa-calendar-alt" /><span id="date-range-display">Select date range</span></div><input type="hidden" id="date_from" defaultValue={today} /><input type="hidden" id="date_to" defaultValue={today} /></div>
          <div className="maintenance-form-group maintenance-search-inline" id="from-search-row"><label className="maintenance-label" htmlFor="filter_from_search">Search</label><div className="search-container maintenance-search-container"><svg className="search-icon" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" /></svg><input type="text" id="filter_from_search" placeholder="e.g. TEST M16(CIMB) / CIMB" className="search-input maintenance-search-input" autoComplete="off" /></div></div>
          <div className="maintenance-form-group quick-select-wrap"><label className="form-label"><i className="fas fa-clock" /> Quick Select</label><div className="quick-select-dropdown quick-select-dropdown-toggle"><button type="button" className="dropdown-toggle" onClick={(e) => { e.stopPropagation(); window.toggleQuickSelectDropdown?.(); }}><i className="fas fa-calendar-alt" /><span id="quick-select-text">Period</span><i className="fas fa-chevron-down" /></button><div className="dropdown-menu" id="quick-select-dropdown"><button type="button" className="dropdown-item" onClick={() => window.selectQuickRange?.("today")}>Today</button><button type="button" className="dropdown-item" onClick={() => window.selectQuickRange?.("yesterday")}>Yesterday</button><button type="button" className="dropdown-item" onClick={() => window.selectQuickRange?.("thisWeek")}>This Week</button><button type="button" className="dropdown-item" onClick={() => window.selectQuickRange?.("lastWeek")}>Last Week</button><button type="button" className="dropdown-item" onClick={() => window.selectQuickRange?.("thisMonth")}>This Month</button><button type="button" className="dropdown-item" onClick={() => window.selectQuickRange?.("lastMonth")}>Last Month</button><button type="button" className="dropdown-item" onClick={() => window.selectQuickRange?.("thisYear")}>This Year</button><button type="button" className="dropdown-item" onClick={() => window.selectQuickRange?.("lastYear")}>Last Year</button></div></div></div>
        </div>
        <div className="maintenance-filter-row">
          <div className="maintenance-filter-left">
            {fs.snapGroupIds.length > 0 && <div id="group-buttons-wrapper" className="transaction-company-filter shared-group-wrapper"><span className="transaction-company-label">GroupID:</span><div id="group-buttons-container" className="transaction-company-buttons">{fs.snapGroupIds.map((gid) => <button key={gid} type="button" className={`transaction-company-btn shared-group-btn ${fs.selectedGroup === gid ? "active" : ""}`} data-group-id={gid}>{gid}</button>)}</div></div>}
            {fs.snapCompanies.length > 0 && <div id="company-buttons-wrapper" className="transaction-company-filter shared-company-wrapper"><span className="transaction-company-label">Company:</span><div id="company-buttons-container" className="transaction-company-buttons">{fs.snapCompanies.map((comp) => <button key={comp.id} type="button" style={companyButtonStyle(comp, fs.selectedGroup)} className={`transaction-company-btn shared-company-btn ${Number(comp.id) === Number(fs.companyId) ? "active" : ""}`} data-company-id={comp.id} data-group-id={comp.group_id != null ? String(comp.group_id).toUpperCase().trim() : ""} data-company-code={comp.company_id}>{comp.company_id}</button>)}</div></div>}
            <div id="currency-buttons-wrapper" className="maintenance-company-filter" style={{ display: "none" }}><span className="maintenance-company-label">Currency:</span><div className="maintenance-company-buttons" id="currency-buttons-container" /></div>
          </div>
          <div className="maintenance-actions">
            <button type="button" className="maintenance-delete-btn" id="deleteBtn" onClick={() => window.deleteData?.()} disabled>Delete</button>
            <label className="maintenance-confirm-delete-label"><input type="checkbox" id="confirmDelete" className="maintenance-checkbox" onChange={() => window.toggleDeleteButton?.()} /><span>Confirm Delete</span></label>
          </div>
        </div>
      </div>
      <div className="maintenance-list-container" id="tableContainer" style={{ display: "none" }}>
        <table className="maintenance-table"><thead><tr><th>No.</th><th>Dts Created</th><th>Account</th><th>From</th><th className="maintenance-header-amount">Amount</th><th>Description</th><th>Remark</th><th>Submitted By</th><th className="maintenance-select-all-header"><input type="checkbox" id="select_all_bankprocess" className="maintenance-checkbox" title="Select All" onChange={(e) => window.toggleSelectAllRows?.(e.target)} /></th></tr></thead><tbody id="dataTableBody" /></table>
      </div>
      <div className="empty-state-container" id="emptyState" style={{ display: "none" }}><div className="empty-state"><p>No bank process transactions found. Please adjust your search criteria and try again.</p></div></div>
      <div id="notificationContainer" className="maintenance-notification-container" />
      <div id="confirmDeleteModal" className="maintenance-modal" style={{ display: "none" }}><div className="maintenance-confirm-modal-content"><div className="maintenance-confirm-icon-container"><svg className="maintenance-confirm-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg></div><h2 className="maintenance-confirm-title">Confirm Delete</h2><p id="confirmDeleteMessage" className="maintenance-confirm-message">This action cannot be undone.</p><div className="maintenance-confirm-actions"><button type="button" className="maintenance-btn maintenance-btn-cancel confirm-cancel" onClick={() => window.closeConfirmDeleteModal?.()}>Cancel</button><button type="button" className="maintenance-btn maintenance-btn-delete confirm-delete" onClick={() => window.confirmDelete?.()}>Delete</button></div></div></div>
      <div className="calendar-popup" id="calendar-popup" style={{ display: "none" }}>
        <div className="calendar-header"><button type="button" className="calendar-nav-btn" onClick={(e) => { e.stopPropagation(); window.changeMonth?.(-1); }}><i className="fas fa-chevron-left" /></button><div className="calendar-month-year" onClick={(e) => e.stopPropagation()}><select id="calendar-month-select" defaultValue="0"><option value="0">Jan</option><option value="1">Feb</option><option value="2">Mar</option><option value="3">Apr</option><option value="4">May</option><option value="5">Jun</option><option value="6">Jul</option><option value="7">Aug</option><option value="8">Sep</option><option value="9">Oct</option><option value="10">Nov</option><option value="11">Dec</option></select><select id="calendar-year-select" /></div><button type="button" className="calendar-nav-btn" onClick={(e) => { e.stopPropagation(); window.changeMonth?.(1); }}><i className="fas fa-chevron-right" /></button></div>
        <div className="calendar-weekdays"><div className="calendar-weekday">Sun</div><div className="calendar-weekday">Mon</div><div className="calendar-weekday">Tue</div><div className="calendar-weekday">Wed</div><div className="calendar-weekday">Thu</div><div className="calendar-weekday">Fri</div><div className="calendar-weekday">Sat</div></div>
        <div className="calendar-days" id="calendar-days" />
      </div>
    </div>
  );
}
