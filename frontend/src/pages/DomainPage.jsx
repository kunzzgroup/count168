import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { buildApiUrl } from "../utils/apiUrl.js";

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

const LEGACY_MODAL_HTML = `
<div id="domainFeeSettingsModal" class="modal" style="z-index: 10004;">
  <div class="modal-content" style="max-width: 440px;">
    <span class="close" onclick="closeDomainFeeSettingsModal()">&times;</span>
    <h2>Price</h2>
    <div class="modal-body" style="display: block; padding: clamp(10px, 1.04vw, 20px) clamp(20px, 1.67vw, 32px);">
      <p style="color: #64748b; font-size: clamp(10px, 0.78vw, 14px); margin: 0 0 10px 0;">Set default amounts for the domain list (saved for C168 admin use).</p>
      <div id="domainFeeSummaryDisplay" class="domain-fee-summary-display" aria-live="polite"></div>
      <p class="domain-fee-edit-hint">Edit fields below support up to 2 decimal places.</p>
      <div class="form-group">
        <label for="domainFeePrice">Price <span class="domain-fee-decimals-hint">(edit)</span></label>
        <input type="number" id="domainFeePrice" class="form-group input" step="0.01" placeholder="0.00" style="width: 100%; padding: clamp(5px, 0.42vw, 8px) clamp(6px, 0.63vw, 12px); border: 1px solid #d1d5db; border-radius: clamp(4px, 0.42vw, 8px); font-size: clamp(10px, 0.83vw, 16px); box-sizing: border-box;">
      </div>
      <div class="form-actions" style="margin-top: 20px; display: flex; gap: 10px; flex-wrap: wrap;">
        <button type="button" class="btn btn-save" onclick="saveDomainFeeSettings()">Save</button>
        <button type="button" class="btn btn-cancel" onclick="closeDomainFeeSettingsModal()">Cancel</button>
      </div>
    </div>
  </div>
</div>

<div id="confirmModal" class="modal">
  <div class="confirm-modal-content">
    <div class="confirm-icon-container">
      <svg class="confirm-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
      </svg>
    </div>
    <h2 class="confirm-title">Confirm Delete</h2>
    <p id="confirmMessage" class="confirm-message"></p>
    <div class="confirm-actions">
      <button type="button" class="btn btn-cancel confirm-cancel" onclick="closeConfirmModal()">Cancel</button>
      <button type="button" class="btn btn-delete confirm-delete" id="confirmDeleteBtn">Delete</button>
    </div>
  </div>
</div>

<div id="companyExpirationModal" class="modal" style="z-index: 10002;">
  <div class="modal-content" style="max-width: 600px;">
    <span class="close" onclick="closeCompanyExpirationModal()">&times;</span>
    <h2>Company Expiration Status</h2>
    <div class="modal-body" style="display: block; padding: clamp(10px, 1.04vw, 20px) clamp(20px, 1.67vw, 32px);">
      <div id="companyExpirationList" style="min-height: 100px; max-height: 400px; overflow-y: auto;"></div>
    </div>
  </div>
</div>

<div id="companyExpDateModal" class="modal" style="z-index: 10003;">
  <div class="modal-content company-settings-modal-content company-settings-modal-content--split">
    <span class="close" onclick="closeCompanyExpDateModal(true)">&times;</span>
    <h2>Company Settings</h2>
    <div class="modal-body company-settings-modal-body">
      <div class="company-settings-split">
        <div id="companySettingsPanelGeneral" class="company-settings-split-left">
          <h3 class="company-settings-column-title">Company settings</h3>
          <div class="form-group">
            <label id="expDateCompanyName" style="font-weight: bold; font-size: clamp(12px, 1.04vw, 16px); color: #1e293b; margin-bottom: 15px;">Company: </label>
          </div>
          <div style="display: flex; gap: 16px; flex-wrap: wrap;">
            <div class="form-group" style="flex: 1; min-width: 140px;">
              <label for="expDateStartDate">Start Date</label>
              <input type="date" id="expDateStartDate" class="form-group input" style="width: 100%; padding: clamp(4px, 0.31vw, 6px) clamp(6px, 0.63vw, 12px); border: 1px solid #d1d5db; border-radius: clamp(4px, 0.42vw, 8px); font-size: clamp(9px, 0.73vw, 14px);">
              <small style="color: #64748b; font-size: clamp(7px, 0.52vw, 10px); margin-top: 4px; display: block;" id="expDateStartDateHelp">Select the start date for calculating expiration date</small>
            </div>
            <div class="form-group" style="flex: 1; min-width: 140px;">
              <label for="expDatePeriod">Period</label>
              <select id="expDatePeriod" class="form-group input" style="width: 100%; padding: clamp(5px, 0.42vw, 8px) clamp(6px, 0.63vw, 12px); border: 1px solid #d1d5db; border-radius: clamp(4px, 0.42vw, 8px); font-size: clamp(9px, 0.73vw, 14px);">
                <option value="">Select Period</option>
                <option value="7days">7 Days</option><option value="1month">1 Month</option><option value="3months">3 Months</option><option value="6months">6 Months</option><option value="1year">1 Year</option>
              </select>
            </div>
          </div>
          <div class="form-group" style="margin-bottom: 10px;">
            <label style="font-size: clamp(9px, 0.73vw, 13px);">Expiration Date</label>
            <div style="padding: clamp(5px, 0.5vw, 8px); background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: clamp(4px, 0.42vw, 6px); font-size: clamp(10px, 0.78vw, 14px); font-weight: 600; color: #1e293b; text-align: center;" id="expDateDisplay">Not set</div>
          </div>
          <div class="form-group" style="margin-bottom: 8px;">
            <label style="margin-bottom: 2px;">Permissions (for Process List & Data Capture)</label>
            <div class="permission-toggle-row">
              <label class="permission-toggle-btn" id="permissionLabelGambling"><input type="checkbox" value="Games" id="permissionGambling" class="permission-checkbox" onchange="onPermissionCheckboxChange(this)"><span>Games</span></label>
              <label class="permission-toggle-btn" id="permissionLabelBank"><input type="checkbox" value="Bank" id="permissionBank" class="permission-checkbox" onchange="onPermissionCheckboxChange(this)"><span>Bank</span></label>
              <label class="permission-toggle-btn" id="permissionLabelLoan"><input type="checkbox" value="Loan" id="permissionLoan" class="permission-checkbox" onchange="onPermissionCheckboxChange(this)"><span>Loan</span></label>
              <label class="permission-toggle-btn" id="permissionLabelRate"><input type="checkbox" value="Rate" id="permissionRate" class="permission-checkbox" onchange="onPermissionCheckboxChange(this)"><span>Rate</span></label>
              <label class="permission-toggle-btn" id="permissionLabelMoney"><input type="checkbox" value="Money" id="permissionMoney" class="permission-checkbox" onchange="onPermissionCheckboxChange(this)"><span>Money</span></label>
            </div>
          </div>
        </div>
        <div class="company-settings-split-divider" role="separator" aria-orientation="vertical" aria-hidden="true"></div>
        <div id="companySettingsPanelShare" class="company-settings-split-right">
          <div class="company-settings-share-header">
            <h3 class="company-settings-column-title company-settings-share-title">Share %</h3>
            <div class="company-share-charge-on-save"><span class="company-share-charge-on-save__state" id="companyShareChargeState" aria-hidden="true">Off</span><label class="company-share-charge-switch"><input type="checkbox" id="companyShareChargeToggle" class="company-share-charge-switch__input" role="switch" aria-checked="false" onchange="syncCompanyShareChargeToggleUi()"><span class="company-share-charge-switch__track" aria-hidden="true"><span class="company-share-charge-switch__thumb"></span></span></label></div>
          </div>
          <div class="company-share-scroll">
            <div class="company-share-role-card" data-share-card="sales"><div class="company-share-role-header" role="button" tabindex="0" aria-expanded="false" aria-controls="shareRowsSales" onclick="toggleShareRoleCard('sales')"><div class="company-share-role-header-left"><span class="company-share-role-badge company-share-role-badge--sales">Sales</span><span class="company-share-account-count-display" id="shareAccountSummary-sales">0 accounts</span></div><div class="company-share-role-header-middle"><div class="company-share-role-alloc-row"><span class="company-share-role-alloc-label">Share total</span><span class="company-share-card-sum" id="shareTotalSales">0.00%</span></div><div class="company-share-progress-track"><div class="company-share-progress-fill" id="shareProgressFill-sales"></div></div></div><div class="company-share-role-header-right"><button type="button" class="company-share-btn-manage" onclick="event.stopPropagation(); toggleShareRoleCard('sales');">Manage</button></div></div><div class="company-share-role-body"><div class="company-share-column-labels"><span>Account</span><span>Share</span><span>Total</span><span class="company-share-col-actions" aria-hidden="true"></span></div><div class="company-share-rows" id="shareRowsSales" role="list"></div><button type="button" class="company-share-add-btn" onclick="addCompanyShareRow('sales')">+ Add Account</button></div></div>
            <div class="company-share-role-card" data-share-card="cs"><div class="company-share-role-header" role="button" tabindex="0" aria-expanded="false" aria-controls="shareRowsCs" onclick="toggleShareRoleCard('cs')"><div class="company-share-role-header-left"><span class="company-share-role-badge company-share-role-badge--cs">CS</span><span class="company-share-account-count-display" id="shareAccountSummary-cs">0 accounts</span></div><div class="company-share-role-header-middle"><div class="company-share-role-alloc-row"><span class="company-share-role-alloc-label">Share total</span><span class="company-share-card-sum" id="shareTotalCs">0.00%</span></div><div class="company-share-progress-track"><div class="company-share-progress-fill" id="shareProgressFill-cs"></div></div></div><div class="company-share-role-header-right"><button type="button" class="company-share-btn-manage" onclick="event.stopPropagation(); toggleShareRoleCard('cs');">Manage</button></div></div><div class="company-share-role-body"><div class="company-share-column-labels"><span>Account</span><span>Share</span><span>Total</span><span class="company-share-col-actions" aria-hidden="true"></span></div><div class="company-share-rows" id="shareRowsCs" role="list"></div><button type="button" class="company-share-add-btn" onclick="addCompanyShareRow('cs')">+ Add Account</button></div></div>
            <div class="company-share-role-card" data-share-card="it"><div class="company-share-role-header" role="button" tabindex="0" aria-expanded="false" aria-controls="shareRowsIt" onclick="toggleShareRoleCard('it')"><div class="company-share-role-header-left"><span class="company-share-role-badge company-share-role-badge--it">IT</span><span class="company-share-account-count-display" id="shareAccountSummary-it">0 accounts</span></div><div class="company-share-role-header-middle"><div class="company-share-role-alloc-row"><span class="company-share-role-alloc-label">Share total</span><span class="company-share-card-sum" id="shareTotalIt">0.00%</span></div><div class="company-share-progress-track"><div class="company-share-progress-fill" id="shareProgressFill-it"></div></div></div><div class="company-share-role-header-right"><button type="button" class="company-share-btn-manage" onclick="event.stopPropagation(); toggleShareRoleCard('it');">Manage</button></div></div><div class="company-share-role-body"><div class="company-share-column-labels"><span>Account</span><span>Share</span><span>Total</span><span class="company-share-col-actions" aria-hidden="true"></span></div><div class="company-share-rows" id="shareRowsIt" role="list"></div><button type="button" class="company-share-add-btn" onclick="addCompanyShareRow('it')">+ Add Account</button></div></div>
          </div>
        </div>
      </div>
      <div class="form-actions company-settings-form-actions"><button type="button" class="btn btn-save" onclick="saveCompanyExpDate()">Save</button><button type="button" class="btn btn-cancel" onclick="resetCompanyExpDateInModal()">Reset</button><button type="button" class="btn btn-cancel" onclick="closeCompanyExpDateModal(true)">Cancel</button></div>
    </div>
  </div>
</div>

<div id="domainModal" class="modal">
  <div class="modal-container-wide">
    <div class="modal-header-wide"><h2 id="modalTitle">EDIT DOMAIN</h2><button class="modal-close-btn" onclick="closeModal()">&times;</button></div>
    <form id="domainForm">
      <input type="hidden" id="domainId" name="id">
      <div class="modal-body-wide">
        <div class="section-titles-row"><div class="section-title">DOMAIN INFORMATION</div><div class="section-title">COMPANY INFORMATION</div></div>
        <div class="section-divider"></div>
        <div class="two-columns">
          <div class="column-left">
            <div class="form-group"><label for="owner_code">Owner Code *</label><input type="text" id="owner_code" name="owner_code" required></div>
            <div class="form-group"><label for="name">Name *</label><input type="text" id="name" name="name" required></div>
            <div class="form-group"><label for="email">Email *</label><input type="email" id="email" name="email" required pattern=".*@gmail\\.com$"></div>
            <div class="form-group" id="passwordGroup"><label for="password">Password *</label><input type="password" id="password" name="password"></div>
            <div class="form-group" id="secondaryPasswordGroup"><label for="secondary_password">Secondary Password *</label><input type="password" id="secondary_password" name="secondary_password" maxlength="6" pattern="[0-9]{6}" placeholder="6 digits only" required><small class="form-hint">Must be exactly 6 digits (0-9)</small></div>
          </div>
          <div class="column-right">
            <div class="inputs-row">
              <div class="form-group" style="flex:1;"><label for="groupInput">Group ID</label><div class="input-with-btn"><input type="text" id="groupInput" placeholder="GROUP ID" style="text-transform: uppercase;"><button type="button" class="btn-inline-add" onclick="addGroupToList()">Add</button></div></div>
              <div class="form-group" style="flex:1;"><label for="companyInput">Company ID</label><div class="input-with-btn"><input type="text" id="companyInput" placeholder="COMPANY ID" style="text-transform: uppercase;"><button type="button" class="btn-inline-add" onclick="addCompanyToList()">Add</button></div></div>
            </div>
            <div class="form-group" id="groupPillsSection"><label>Group :</label><div class="group-pills" id="groupPillsContainer"><span style="color: #94a3b8; font-size: 12px;">No groups created</span></div></div>
            <div class="form-group" style="flex:1;display:flex;flex-direction:column;"><div class="selected-companies-header"><label>Selected Companies :</label><button type="button" class="badge-multi" id="multipleChoiceBtn" onclick="toggleMultipleChoice()" style="border:none;cursor:pointer;">Multiple Choice</button></div><div class="companies-list-box" id="companyItems"><span style="color: #94a3b8; font-size: 12px;">No companies added yet</span></div></div>
            <input type="hidden" id="companies" name="companies">
          </div>
        </div>
      </div>
      <div class="modal-footer-wide"><button type="submit" class="btn-wide btn-wide-confirm">Confirm</button><button type="button" class="btn-wide btn-wide-cancel" onclick="closeModal()">Cancel</button></div>
    </form>
  </div>
</div>

<div id="notificationContainer" class="notification-container" style="z-index:2147483647;"></div>
`;

export default function DomainPage() {
  const navigate = useNavigate();
  const [me, setMe] = useState(null);
  const [domains, setDomains] = useState([]);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    document.body.classList.remove("bg");
    document.body.classList.add("dashboard-page");
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "/css/domain.css";
    document.head.appendChild(link);

    (async () => {
      try {
        const res = await fetch(buildApiUrl("api/session/current_user_api.php"), { credentials: "include" });
        const json = await res.json();
        if (!res.ok || !json.success || !json.data) return navigate("/login", { replace: true });
        const u = json.data;
        setMe(u);
        // Stay in SPA /domain and render immediately.
        setReady(true);
        window.DOMAIN_HAS_C168_CONTEXT = !!u.has_c168_domain_page_access;
        window.DOMAIN_IS_OWNER_OR_ADMIN = ["owner", "admin"].includes(String(u.role || "").toLowerCase());

        const r2 = await fetch(buildApiUrl("api/domain/domain_api.php"), {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "list" }),
        });
        const j2 = await r2.json();
        if (!r2.ok || !j2?.success) {
          setDomains([]);
          setLoadError(j2?.message || "Failed to load domain data");
          return;
        }
        setDomains(Array.isArray(j2?.data?.domains) ? j2.data.domains : []);
        setLoadError("");
      } catch {
        setReady(true);
        setLoadError("Failed to load domain data");
      }
    })();

    return () => {
      document.body.classList.remove("dashboard-page");
      document.body.classList.add("bg");
      document.head.removeChild(link);
    };
  }, [navigate]);

  useEffect(() => {
    if (!ready) return;
    const scriptId = "legacy-domain-js";
    const initLegacy = () => {
      if (typeof window.refreshDomainFeeSummaryFromApi === "function") window.refreshDomainFeeSummaryFromApi();
      if (typeof window.setupSearch === "function") window.setupSearch();
      if (typeof window.initializePagination === "function") window.initializePagination();
      if (typeof window.syncDeleteCheckboxProtection === "function") window.syncDeleteCheckboxProtection();
      if (typeof window.updateDeleteButton === "function") window.updateDeleteButton();
      if (typeof window.initializeCompanyClickHandlers === "function") window.initializeCompanyClickHandlers();
    };
    const existing = document.getElementById(scriptId);
    if (existing) {
      initLegacy();
      return;
    }
    const s = document.createElement("script");
    s.id = scriptId;
    s.src = "/js/domain.js";
    s.onload = () => {
      document.dispatchEvent(new Event("DOMContentLoaded", { bubbles: true, cancelable: true }));
      initLegacy();
    };
    document.body.appendChild(s);
  }, [ready, domains]);

  const avatarSrc = useMemo(() => AVATAR_MAP[readCookie("selectedAvatar")] || AVATAR_MAP.male1, [me]);
  const roleLabel = me?.role ? me.role.charAt(0).toUpperCase() + me.role.slice(1).toLowerCase() : "";
  const permissions = Array.isArray(me?.permissions) ? me.permissions : [];
  const hasFullPermissions = permissions.length === 0;
  const canAccess = (key) => hasFullPermissions || permissions.includes(key);
  const phpHref = (path) => new URL(path, window.location.origin).href;
  const logout = () => window.location.assign(new URL("dashboard.php?logout=1", window.location.origin).href);

  return (
    <>
      <div className="informationmenu-overlay" style={{ display: "none" }} aria-hidden="true" />
      <div className="informationmenu">
        <div className="informationmenu-header">
          <div className="header-logo-section"><img src="/images/count_whitelogo.png" alt="EAZYCOUNT" className="header-logo" /></div>
          <div className="user-info-container"><div className="avatar-selector-container"><div className="current-avatar"><img className="current-avatar-img" src={avatarSrc} alt="" width={36} height={36} /></div></div><div className="user-info"><div className="user-name">{me?.name || me?.login_id || "-"}</div><div className="user-role">{roleLabel || "User"}</div></div></div>
        </div>
        <div className="informationmenu-content">
          <div className="content-separator" />
          {canAccess("home") && <div className="informationmenu-section"><div className="informationmenu-section-title account-direct" onClick={() => navigate("/dashboard")} role="presentation"><svg className="section-icon" fill="currentColor" viewBox="0 0 24 24"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" /></svg>Home</div></div>}
          {me?.has_c168_domain_page_access && <div className="informationmenu-section"><div className="informationmenu-section-title current-page"><svg className="section-icon" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm6.93 8h-3.46c-.14-2.01-.5-3.88-1.06-5.38 2.16.76 3.76 2.62 4.52 5.38zm-6.93 0h-4.9c.13-1.78.58-3.51 1.28-4.9.53-1.04 1.16-1.79 1.78-2.21.6-.41.98-.46 1.84-.46v7.57zm0 2v7.57c-.86 0-1.24-.05-1.84-.46-.62-.43-1.25-1.17-1.78-2.21-.7-1.39-1.15-3.12-1.28-4.9h4.9zm2 7.43V12h4.9c-.13 1.78-.58 3.51-1.28 4.9-.53 1.04-1.16 1.79-1.78 2.21-.6.41-.98.46-1.84.46zm0-9.43V4.43c.86 0 1.24.05 1.84.46.62.43 1.25 1.17 1.78 2.21.7 1.39 1.15 3.12 1.28 4.9h-4.9zM5.07 12h3.46c.14 2.01.5 3.88 1.06 5.38-2.16-.76-3.76-2.62-4.52-5.38z" /></svg>Domain</div></div>}
          {me?.has_c168_domain_page_access && <div className="informationmenu-section"><div className="informationmenu-section-title account-direct" onClick={() => navigate("/announcement")} role="presentation"><svg className="section-icon" fill="currentColor" viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" /></svg>Announcement</div></div>}
        </div>
        <div className="informationmenu-footer"><div className={`company-expiration-countdown ${me?.expiration_status || "normal"}`}><svg className="expiration-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg><div className="expiration-content"><span className="expiration-label">Exp:</span><span className={`expiration-countdown-text ${me?.expiration_status || "normal"}`}>{me?.expiration_hint || "-"}</span></div></div><button type="button" className="btn logout-btn" onClick={logout}>Logout</button></div>
      </div>

      <div className="container">
        <h1>Domain List</h1>
        {loadError && (
          <div style={{ marginBottom: 10, color: "#b91c1c", fontWeight: 600 }}>
            {loadError}
          </div>
        )}
        <div className="action-buttons" style={{ marginBottom: 0, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button className="btn btn-add" onClick={() => window.openAddModal?.()}>Add Domain</button>
            <div className="search-container">
              <svg className="search-icon" fill="currentColor" viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
              <input type="text" id="searchInput" placeholder="Search by Owner Name/Company" className="search-input" />
            </div>
            <button type="button" className="btn btn-fee-settings" id="domainFeeSettingsBtn" onClick={() => window.openDomainFeeSettingsModal?.()}>Price</button>
            <span id="domainFeeInlineSummary" className="domain-fee-inline-summary" aria-live="polite" />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button className="btn btn-delete" id="deleteSelectedBtn" onClick={() => window.deleteSelected?.()}>Delete</button>
          </div>
        </div>
        <div className="separator-line" />
        <div className="table-container">
          <div className="table-header">
            <div className="header-item">No:</div><div className="header-item">Owner Code:</div><div className="header-item">Name:</div><div className="header-item">Email:</div><div className="header-item">GroupID:</div><div className="header-item">Companies:</div><div className="header-item">Created By:</div><div className="header-item">Action:</div>
          </div>
          <div className="domain-cards" id="domainTableBody">
            {domains.map((domain, idx) => {
              const companiesFull = Array.isArray(domain.companies_full) ? domain.companies_full : [];
              const companyList = companiesFull.map((c) => c.company_id).filter(Boolean);
              const visible = companyList.slice(0, 3);
              const hidden = companyList.slice(3);
              return (
                <div className="domain-card" data-id={domain.id} key={domain.id}>
                  <div className="card-item">{idx + 1}</div>
                  <div className="card-item uppercase-text">{domain.owner_code}</div>
                  <div className="card-item">{domain.name}</div>
                  <div className="card-item">{domain.email}</div>
                  <div className="card-item">{domain.group_ids || "-"}</div>
                  <div className="card-item companies-column" data-companies={JSON.stringify(companiesFull)}>
                    {companyList.length === 0 ? "-" : (
                      <div className="chip-group">
                        {visible.map((companyId) => {
                          const exp = companiesFull.find((c) => c.company_id === companyId)?.expiration_date || "";
                          return <span key={companyId} className="chip company-badge" data-exp={exp || undefined}>{companyId}</span>;
                        })}
                        {hidden.length > 0 && <span className="chip-more" title={hidden.join(", ")}>+{hidden.length}</span>}
                      </div>
                    )}
                  </div>
                  <div className="card-item uppercase-text">{String(domain.created_by || "-").toUpperCase()}</div>
                  <div className="card-item">
                    <button className="btn btn-edit edit-btn" onClick={() => window.editDomain?.(domain.id)} aria-label="Edit"><img src="/images/edit.svg" alt="Edit" /></button>
                    {String(domain.owner_code || "").toUpperCase() !== "K" && <input type="checkbox" className="domain-checkbox" value={domain.id} onChange={() => window.updateDeleteButton?.()} />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="pagination-container" id="paginationContainer">
          <button className="pagination-btn" id="prevBtn" onClick={() => window.changePage?.(-1)}>◀</button>
          <span className="pagination-info" id="paginationInfo">1 of 1</span>
          <button className="pagination-btn" id="nextBtn" onClick={() => window.changePage?.(1)}>▶</button>
        </div>
      </div>

      <div dangerouslySetInnerHTML={{ __html: LEGACY_MODAL_HTML }} />
    </>
  );
}
