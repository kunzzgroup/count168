import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { assetUrl, buildApiUrl } from "../utils/apiUrl.js";

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
          <div class="company-share-grand-total" style="display: none;">
            <span id="shareGrandTotal">0.00%</span>
            <div class="company-share-progress-track"><div id="shareGrandTotalBar" class="company-share-progress-fill"></div></div>
          </div>
          <div class="company-share-scroll">
            <div class="company-share-role-card company-share-role-card--profit-pool" data-share-card="profit">
              <div class="company-share-role-header" role="button" tabindex="0" aria-expanded="false" aria-controls="shareRowsProfit" onclick="toggleShareRoleCard('profit')">
                <div class="company-share-role-header-left"><span class="company-share-role-badge company-share-role-badge--profit">Profit</span><span class="company-share-account-count-display" id="shareAccountSummary-profit">0 accounts</span></div>
                <div class="company-share-role-header-middle"><div class="company-share-role-alloc-row"><span class="company-share-role-alloc-label">Share total</span><span class="company-share-card-sum" id="shareTotalProfit">0.00%</span></div><div class="company-share-progress-track"><div class="company-share-progress-fill" id="shareProgressFill-profit"></div></div></div>
                <div class="company-share-role-header-right"><button type="button" class="company-share-btn-manage" onclick="event.stopPropagation(); toggleShareRoleCard('profit');">Manage</button></div>
              </div>
              <div class="company-share-role-body company-share-role-body--profit-pool"><div class="company-share-column-labels company-share-column-labels--profit-pool"><span>Account</span><span>Total</span><span class="company-share-col-actions" aria-hidden="true"></span></div><div class="company-share-rows" id="shareRowsProfit" role="list"></div><button type="button" class="company-share-add-btn" onclick="addCompanyShareRow('profit')">+ Add Account</button></div>
            </div>
            <div class="company-share-role-card" data-share-card="sales"><div class="company-share-role-header" role="button" tabindex="0" aria-expanded="false" aria-controls="shareRowsSales" onclick="toggleShareRoleCard('sales')"><div class="company-share-role-header-left"><span class="company-share-role-badge company-share-role-badge--sales">Sales</span><span class="company-share-account-count-display" id="shareAccountSummary-sales">0 accounts</span></div><div class="company-share-role-header-middle"><div class="company-share-role-alloc-row"><span class="company-share-role-alloc-label">Share total</span><span class="company-share-card-sum" id="shareTotalSales">0.00%</span></div><div class="company-share-progress-track"><div class="company-share-progress-fill" id="shareProgressFill-sales"></div></div></div><div class="company-share-role-header-right"><button type="button" class="company-share-btn-manage" onclick="event.stopPropagation(); toggleShareRoleCard('sales');">Manage</button></div></div><div class="company-share-role-body"><div class="company-share-column-labels"><span>Account</span><span>Share</span><span>Total</span><span class="company-share-col-actions" aria-hidden="true"></span></div><div class="company-share-rows" id="shareRowsSales" role="list"></div><button type="button" class="company-share-add-btn" onclick="addCompanyShareRow('sales')">+ Add Account</button></div></div>
            <div class="company-share-role-card" data-share-card="cs"><div class="company-share-role-header" role="button" tabindex="0" aria-expanded="false" aria-controls="shareRowsCs" onclick="toggleShareRoleCard('cs')"><div class="company-share-role-header-left"><span class="company-share-role-badge company-share-role-badge--cs">CS</span><span class="company-share-account-count-display" id="shareAccountSummary-cs">0 accounts</span></div><div class="company-share-role-header-middle"><div class="company-share-role-alloc-row"><span class="company-share-role-alloc-label">Share total</span><span class="company-share-card-sum" id="shareTotalCs">0.00%</span></div><div class="company-share-progress-track"><div class="company-share-progress-fill" id="shareProgressFill-cs"></div></div></div><div class="company-share-role-header-right"><button type="button" class="company-share-btn-manage" onclick="event.stopPropagation(); toggleShareRoleCard('cs');">Manage</button></div></div><div class="company-share-role-body"><div class="company-share-column-labels"><span>Account</span><span>Share</span><span>Total</span><span class="company-share-col-actions" aria-hidden="true"></span></div><div class="company-share-rows" id="shareRowsCs" role="list"></div><button type="button" class="company-share-add-btn" onclick="addCompanyShareRow('cs')">+ Add Account</button></div></div>
            <div class="company-share-role-card" data-share-card="it"><div class="company-share-role-header" role="button" tabindex="0" aria-expanded="false" aria-controls="shareRowsIt" onclick="toggleShareRoleCard('it')"><div class="company-share-role-header-left"><span class="company-share-role-badge company-share-role-badge--it">IT</span><span class="company-share-account-count-display" id="shareAccountSummary-it">0 accounts</span></div><div class="company-share-role-header-middle"><div class="company-share-role-alloc-row"><span class="company-share-role-alloc-label">Share total</span><span class="company-share-card-sum" id="shareTotalIt">0.00%</span></div><div class="company-share-progress-track"><div class="company-share-progress-fill" id="shareProgressFill-it"></div></div></div><div class="company-share-role-header-right"><button type="button" class="company-share-btn-manage" onclick="event.stopPropagation(); toggleShareRoleCard('it');">Manage</button></div></div><div class="company-share-role-body"><div class="company-share-column-labels"><span>Account</span><span>Share</span><span>Total</span><span class="company-share-col-actions" aria-hidden="true"></span></div><div class="company-share-rows" id="shareRowsIt" role="list"></div><button type="button" class="company-share-add-btn" onclick="addCompanyShareRow('it')">+ Add Account</button></div></div>
          </div>
          <div id="companyShareNoAccountsHint" style="display: none; color: #64748b; font-size: 12px; margin-top: 8px;">No linked accounts.</div>
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

<div id="domainAddAccountModal" class="account-modal" style="display: none; z-index: 10010;">
  <div class="account-modal-content">
    <div class="account-modal-header">
      <h2>Add Account</h2>
      <span class="account-close" onclick="closeDomainAddAccountModal()">&times;</span>
    </div>
    <div class="account-modal-body">
      <form id="domainAddAccountForm" class="account-form">
        <div class="account-form-columns">
          <div class="account-form-column">
            <h3 class="account-section-header">Personal Information</h3>
            <div class="account-form-group"><label for="domain_add_account_id">Account ID *</label><input type="text" id="domain_add_account_id" name="account_id" required></div>
            <div class="account-form-group"><label for="domain_add_name">Name *</label><input type="text" id="domain_add_name" name="name" required></div>
            <div class="account-form-group"><label for="domain_add_role">Role *</label><select id="domain_add_role" name="role" required><option value="">Select Role</option></select></div>
            <div class="account-form-group"><label for="domain_add_password">Password *</label><input type="password" id="domain_add_password" name="password" required></div>
          </div>
          <div class="account-form-column">
            <h3 class="account-section-header">Payment</h3>
            <div class="account-form-group"><label>Payment Alert</label><div class="account-radio-group"><label class="account-radio-label"><input type="radio" name="add_payment_alert" value="1">Yes</label><label class="account-radio-label"><input type="radio" name="add_payment_alert" value="0" checked>No</label></div></div>
            <div class="account-form-row" id="domain_add_alert_fields" style="display: none;">
              <div class="account-form-group"><label for="domain_add_alert_type">Alert Type</label><select id="domain_add_alert_type" name="alert_type"><option value="">Select Type</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="1">1 Days</option><option value="2">2 Days</option><option value="3">3 Days</option><option value="4">4 Days</option><option value="5">5 Days</option><option value="6">6 Days</option><option value="7">7 Days</option><option value="8">8 Days</option><option value="9">9 Days</option><option value="10">10 Days</option><option value="11">11 Days</option><option value="12">12 Days</option><option value="13">13 Days</option><option value="14">14 Days</option><option value="15">15 Days</option><option value="16">16 Days</option><option value="17">17 Days</option><option value="18">18 Days</option><option value="19">19 Days</option><option value="20">20 Days</option><option value="21">21 Days</option><option value="22">22 Days</option><option value="23">23 Days</option><option value="24">24 Days</option><option value="25">25 Days</option><option value="26">26 Days</option><option value="27">27 Days</option><option value="28">28 Days</option><option value="29">29 Days</option><option value="30">30 Days</option><option value="31">31 Days</option></select></div>
              <div class="account-form-group"><label for="domain_add_alert_start_date">Start Date</label><input type="date" id="domain_add_alert_start_date" name="alert_start_date"></div>
            </div>
            <div class="account-form-group" id="domain_add_alert_amount_row" style="display: none;"><label for="domain_add_alert_amount">Alert (Amount)</label><input type="number" id="domain_add_alert_amount" name="alert_amount" step="0.01" placeholder="Enter amount"></div>
            <div class="account-form-group"><label for="domain_add_remark">Remark</label><textarea id="domain_add_remark" name="remark" rows="1" style="resize: none; overflow-y: hidden; line-height: 1.5;"></textarea></div>
          </div>
        </div>
        <div class="account-form-section"><div class="account-advance-section"><h3>Advanced Account</h3><div class="account-other-currency"><label>Other Currency:</label><div style="display: flex; gap: 8px; margin-bottom: 12px;"><input type="text" id="domainAddCurrencyInput" placeholder="Enter new currency code (e.g., USD)" style="flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 4px;"><button type="button" class="account-btn-add-currency" onclick="addCurrencyFromInputDomain(); return false;">Create Currency</button></div><div class="account-currency-list" id="domainAddCurrencyList"></div></div><div class="account-other-currency" style="margin-top: 20px;"><label>Company:</label><div class="account-currency-list" id="domainAddCompanyList"></div></div></div></div>
        <div class="account-form-actions"><button type="submit" class="account-btn account-btn-save">Add Account</button><button type="button" class="account-btn account-btn-cancel" onclick="closeDomainAddAccountModal()">Cancel</button></div>
      </form>
    </div>
  </div>
</div>
`;

export default function DomainPage() {
  const navigate = useNavigate();
  const [me, setMe] = useState(null);
  const [domains, setDomains] = useState([]);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  const assetVersion = window.__domainAssetVersion || Date.now();
  window.__domainAssetVersion = assetVersion;

  useEffect(() => {
    document.body.classList.remove("bg");
    document.body.classList.add("dashboard-page");
    const links = [];
    const addCss = (href) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      document.head.appendChild(link);
      links.push(link);
    };
    addCss(`/css/domain.css?v=${assetVersion}`);
    addCss(`/css/accountCSS.css?v=${assetVersion}`);

    (async () => {
      try {
        const res = await fetch(buildApiUrl("api/session/current_user_api.php"), { credentials: "include" });
        const json = await res.json();
        if (!res.ok || !json.success || !json.data) return navigate("/login", { replace: true });
        const u = json.data;
        if (!u.has_c168_domain_page_access) {
          navigate("/dashboard", { replace: true });
          return;
        }
        setMe(u);
        // Stay in SPA /domain and render immediately.
        setReady(true);
        window.DOMAIN_HAS_C168_CONTEXT = !!u.has_c168_domain_page_access;
        window.DOMAIN_IS_OWNER_OR_ADMIN = ["owner", "admin"].includes(String(u.role || "").toLowerCase());
        window.DOMAIN_SESSION_COMPANY_ID = u.company_id ?? null;
        window.DOMAIN_SESSION_COMPANY_CODE = String(u.company_code || "");

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
      links.forEach((link) => {
        if (link.parentNode) link.parentNode.removeChild(link);
      });
    };
  }, [navigate]);

  const initLegacy = () => {
    if (typeof window.refreshDomainFeeSummaryFromApi === "function") window.refreshDomainFeeSummaryFromApi();
    if (typeof window.setupSearch === "function") window.setupSearch();
    if (typeof window.initializePagination === "function") window.initializePagination();
    if (typeof window.syncDeleteCheckboxProtection === "function") window.syncDeleteCheckboxProtection();
    if (typeof window.updateDeleteButton === "function") window.updateDeleteButton();
    if (typeof window.initializeCompanyClickHandlers === "function") window.initializeCompanyClickHandlers();
  };

  useEffect(() => {
    if (!ready) return;
    const scriptId = "legacy-domain-js";
    if (window.__domainLegacyScriptLoaded) return;

    const s = document.createElement("script");
    s.id = scriptId;
    s.src = assetUrl(`js/domain.js?v=${assetVersion}`);
    s.onload = () => {
      window.__domainLegacyScriptLoaded = true;
      if (typeof window.initDomainPageLegacy === "function") window.initDomainPageLegacy();
      initLegacy();
    };
    document.body.appendChild(s);
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    if (window.__domainLegacyScriptLoaded) {
      if (typeof window.initDomainPageLegacy === "function") window.initDomainPageLegacy();
      initLegacy();
    }
  }, [ready, domains]);

  return (
    <>
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
