import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { assetUrl, buildApiUrl } from "../../../utils/apiUrl.js";

function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    const safe = src.replace(/"/g, "");
    const existing = document.querySelector(`script[data-fm-script="${safe}"]`);
    if (existing) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.async = false;
    s.dataset.fmScript = safe;
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

export default function FormulaMaintenancePage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [snapshot, setSnapshot] = useState(null);

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
          setSnapshot({ companyId: u.company_id ? Number(u.company_id) : null, companyCode: current?.company_id || "", selectedGroup: selGroup, snapCompanies: snapRows, snapGroupIds: [...new Set(snapRows.filter((c) => c.group_id).map((c) => String(c.group_id).toUpperCase().trim()))].sort() });
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
    window.FORMULA_MAINTENANCE_COMPANY_ID = snap.companyId;
    window.currentCompanyCode = snap.companyCode || "";
    window.__FORMULA_MAINTENANCE_SPA_MODE = true;
    window.__fmApiHref = (path) => buildApiUrl(String(path || "").replace(/^\//, ""));
    window._sharedCompanyFilterInitialized = false;

    await injectStylesheet("https://fonts.googleapis.com/css?family=Amaranth");
    await injectStylesheet("https://fonts.googleapis.com/css2?family=Amaranth:wght@400;700&display=swap");
    await injectStylesheet("https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css");
    await injectStylesheet(assetUrl("css/accountCSS.css"));
    await injectStylesheet(assetUrl("css/transaction.css"));
    await injectStylesheet(assetUrl("css/formula_maintenance.css"));
    await injectStylesheet(assetUrl("css/global-13inch.css"));

    await loadScriptOnce(assetUrl("js/shared_company_filter.js"));
    window.__initSharedCompanyFilter?.();
    await loadScriptOnce(assetUrl("js/formula_maintenance_v2.js"));
    window.onSharedCompanyFilterChanged = (companyId, companyCode) => window.switchCompany?.(companyId, companyCode);
    await window.__initFormulaMaintenancePage?.();
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
        <h1 id="maintenance-page-title">Maintenance - Formula</h1>
        <div id="maintenance-permission-filter" className="maintenance-permission-filter-header" style={{ display: "none" }}><span className="maintenance-company-label">Category:</span><div id="maintenance-permission-buttons" className="maintenance-company-buttons" /></div>
      </div>
      <div className="maintenance-search-section formula-maintenance-filters-wrap">
        <div className="maintenance-filters">
          <div className="maintenance-form-group">
            <label className="maintenance-label">Process</label>
            <div className="custom-select-wrapper" style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ position: "relative", flex: 1 }}>
                <button type="button" className="custom-select-button" id="filter_process" data-placeholder="--Select All--">--Select All--</button>
                <div className="custom-select-dropdown" id="filter_process_dropdown"><div className="custom-select-search"><input type="text" placeholder="Search process..." autoComplete="off" /></div><div className="custom-select-options" /></div>
              </div>
              <button type="button" id="clear_filters_btn" title="Clear Filters" onClick={() => window.clearFormulaFilters?.()} style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", color: "#ef4444", cursor: "pointer", padding: 4, borderRadius: "50%", opacity: 0, pointerEvents: "none", transition: "opacity 0.2s ease" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
              </button>
            </div>
          </div>
          <div className="maintenance-form-group"><label className="maintenance-label">Search</label><input type="text" id="search_filter" className="maintenance-input" placeholder="Search formula..." /></div>
        </div>
        <div className="maintenance-filter-row">
          <div className="maintenance-filter-left">
            {fs.snapGroupIds.length > 0 && <div id="group-buttons-wrapper" className="transaction-company-filter shared-group-wrapper"><span className="transaction-company-label">GroupID:</span><div id="group-buttons-container" className="transaction-company-buttons">{fs.snapGroupIds.map((gid) => <button key={gid} type="button" className={`transaction-company-btn shared-group-btn ${fs.selectedGroup === gid ? "active" : ""}`} data-group-id={gid}>{gid}</button>)}</div></div>}
            {fs.snapCompanies.length > 0 && <div id="company-buttons-wrapper" className="transaction-company-filter shared-company-wrapper"><span className="transaction-company-label">Company:</span><div id="company-buttons-container" className="transaction-company-buttons">{fs.snapCompanies.map((comp) => <button key={comp.id} type="button" style={companyButtonStyle(comp, fs.selectedGroup)} className={`transaction-company-btn shared-company-btn ${Number(comp.id) === Number(fs.companyId) ? "active" : ""}`} data-company-id={comp.id} data-group-id={comp.group_id != null ? String(comp.group_id).toUpperCase().trim() : ""} data-company-code={comp.company_id}>{comp.company_id}</button>)}</div></div>}
          </div>
          <div className="maintenance-actions">
            <button type="button" className="maintenance-delete-btn" id="deleteBtn" onClick={() => window.deleteData?.()} disabled>Delete</button>
            <label className="maintenance-confirm-delete-label"><input type="checkbox" id="confirmDelete" className="maintenance-checkbox" onChange={() => window.toggleDeleteButton?.()} /><span>Confirm Delete</span></label>
          </div>
        </div>
      </div>
      <div className="empty-state-container" id="emptyState" style={{ display: "none" }}><div className="empty-state"><p>No data found. Please adjust your search criteria and try again.</p></div></div>
      <div className="maintenance-list-container" id="dataCaptureTableContainer" style={{ display: "none", paddingBottom: 20 }}>
        <div style={{ overflowX: "auto" }}>
          <table className="maintenance-table" style={{ width: "100%", borderCollapse: "collapse", minWidth: 1000 }}>
            <thead style={{ position: "sticky", top: 0, zIndex: 10 }}>
              <tr><th style={{ width: "5%" }}>No</th><th style={{ width: "10%" }}>Process</th><th style={{ width: "10%" }}>Account</th><th style={{ width: "5%" }}>Currency</th><th style={{ width: "10%" }}>Source</th><th style={{ width: "10%" }}>Product</th><th style={{ width: "15%" }}>Input Method</th><th style={{ width: "15%" }}>Formula</th><th style={{ width: "12%" }}>Description</th><th style={{ width: "8%", textAlign: "center" }}><input type="checkbox" id="select_all_data_capture" className="maintenance-checkbox" title="Select All" onChange={(e) => window.toggleSelectAllRows?.(e.target)} /></th></tr>
            </thead>
            <tbody id="dataCaptureTableBody" />
          </table>
        </div>
      </div>
      <div id="notificationContainer" className="maintenance-notification-container" />
      <div id="confirmDeleteModal" className="maintenance-modal" style={{ display: "none" }}>
        <div className="maintenance-confirm-modal-content"><div className="maintenance-confirm-icon-container"><svg className="maintenance-confirm-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg></div><h2 className="maintenance-confirm-title">Confirm Delete</h2><p id="confirmDeleteMessage" className="maintenance-confirm-message">This action cannot be undone.</p><div className="maintenance-confirm-actions"><button type="button" className="maintenance-btn maintenance-btn-cancel confirm-cancel" onClick={() => window.closeConfirmDeleteModal?.()}>Cancel</button><button type="button" className="maintenance-btn maintenance-btn-delete confirm-delete" onClick={() => window.confirmDelete?.()}>Delete</button></div></div>
      </div>
    </div>
  );
}
