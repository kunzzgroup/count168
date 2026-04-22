import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { assetUrl, buildApiUrl } from "../utils/apiUrl.js";

const DAY_OPTIONS = Array.from({ length: 31 }, (_, i) => {
  const day = i + 1;
  return `<option value="${day}">${day} Days</option>`;
}).join("");

const MODALS_HTML = `
<div id="editModal" class="account-modal" style="display: none;">
  <div class="account-modal-content">
    <div class="account-modal-header"><h2>Edit Account</h2><span class="account-close" onclick="closeEditModal()">&times;</span></div>
    <div class="account-modal-body">
      <form id="editAccountForm" class="account-form">
        <input type="hidden" id="edit_account_id" name="id">
        <div class="account-form-columns">
          <div class="account-form-column">
            <h3 class="account-section-header">Personal Information</h3>
            <div class="account-form-group"><label for="edit_account_id_field">Account ID *</label><input type="text" id="edit_account_id_field" name="account_id" readonly></div>
            <div class="account-form-group"><label for="edit_name">Name *</label><input type="text" id="edit_name" name="name" required></div>
            <div class="account-form-group"><label for="edit_role">Role *</label><select id="edit_role" name="role" required><option value="">Select Role</option></select></div>
            <div class="account-form-group"><label for="edit_password">Password *</label><input type="password" id="edit_password" name="password" required></div>
          </div>
          <div class="account-form-column">
            <h3 class="account-section-header">Payment</h3>
            <div class="account-form-group"></div>
            <div class="account-form-group">
              <label>Payment Alert</label>
              <div class="account-radio-group">
                <label class="account-radio-label"><input type="radio" name="payment_alert" value="1">Yes</label>
                <label class="account-radio-label"><input type="radio" name="payment_alert" value="0">No</label>
              </div>
            </div>
            <div class="account-form-row" id="edit_alert_fields" style="display: none;">
              <div class="account-form-group"><label for="edit_alert_type">Alert Type</label><select id="edit_alert_type" name="alert_type"><option value="">Select Type</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option>${DAY_OPTIONS}</select></div>
              <div class="account-form-group"><label for="edit_alert_start_date">Start Date</label><input type="date" id="edit_alert_start_date" name="alert_start_date"></div>
            </div>
            <div class="account-form-group" id="edit_alert_amount_row" style="display: none;"><label for="edit_alert_amount">Alert (Amount)</label><input type="number" id="edit_alert_amount" name="alert_amount" step="0.01"></div>
            <div class="account-form-group"><label for="edit_remark">Remark</label><textarea id="edit_remark" name="remark" rows="1" style="resize: none; overflow-y: hidden; line-height: 1.5;"></textarea></div>
          </div>
        </div>
        <div class="account-form-section">
          <div class="account-advance-section">
            <h3>Advanced Account</h3>
            <div class="account-other-currency">
              <label>Other Currency:</label>
              <div style="display: flex; gap: 8px;"><input type="text" id="editCurrencyInput" placeholder="Enter new currency code"><button type="button" class="account-btn-add-currency" onclick="addCurrencyFromInput('edit'); return false;">Create Currency</button></div>
              <div class="account-currency-list" id="editCurrencyList"></div>
            </div>
            <div class="account-other-currency" style="margin-top: 20px;"><label>Company:</label><div class="account-currency-list" id="editCompanyList"></div></div>
          </div>
        </div>
        <div class="account-form-actions"><button type="submit" class="account-btn account-btn-save">Update Account</button><button type="button" class="account-btn account-btn-cancel" onclick="closeEditModal()">Cancel</button></div>
      </form>
    </div>
  </div>
</div>
<div id="accountNotificationContainer" class="account-notification-container"></div>
<div id="addModal" class="account-modal" style="display: none;">
  <div class="account-modal-content">
    <div class="account-modal-header"><h2>Add Account</h2><span class="account-close" onclick="closeAddModal()">&times;</span></div>
    <div class="account-modal-body">
      <form id="addAccountForm" class="account-form">
        <div class="account-form-columns">
          <div class="account-form-column">
            <h3 class="account-section-header">Personal Information</h3>
            <div class="account-form-group"><label for="add_account_id">Account ID *</label><input type="text" id="add_account_id" name="account_id" required></div>
            <div class="account-form-group"><label for="add_name">Name *</label><input type="text" id="add_name" name="name" required></div>
            <div class="account-form-group"><label for="add_role">Role *</label><select id="add_role" name="role" required><option value="">Select Role</option></select></div>
            <div class="account-form-group"><label for="add_password">Password *</label><input type="password" id="add_password" name="password" required></div>
          </div>
          <div class="account-form-column">
            <h3 class="account-section-header">Payment</h3>
            <div class="account-form-group"></div>
            <div class="account-form-group">
              <label>Payment Alert</label>
              <div class="account-radio-group">
                <label class="account-radio-label"><input type="radio" name="add_payment_alert" value="1">Yes</label>
                <label class="account-radio-label"><input type="radio" name="add_payment_alert" value="0" checked>No</label>
              </div>
            </div>
            <div class="account-form-row" id="add_alert_fields" style="display: none;">
              <div class="account-form-group"><label for="add_alert_type">Alert Type</label><select id="add_alert_type" name="alert_type"><option value="">Select Type</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option>${DAY_OPTIONS}</select></div>
              <div class="account-form-group"><label for="add_alert_start_date">Start Date</label><input type="date" id="add_alert_start_date" name="alert_start_date"></div>
            </div>
            <div class="account-form-group" id="add_alert_amount_row" style="display: none;"><label for="add_alert_amount">Alert (Amount)</label><input type="number" id="add_alert_amount" name="alert_amount" step="0.01"></div>
            <div class="account-form-group"><label for="add_remark">Remark</label><textarea id="add_remark" name="remark" rows="1" style="resize: none; overflow-y: hidden; line-height: 1.5;"></textarea></div>
          </div>
        </div>
        <div class="account-form-section">
          <div class="account-advance-section">
            <h3>Advanced Account</h3>
            <div class="account-other-currency">
              <label>Other Currency:</label>
              <div style="display: flex; gap: 8px; margin-bottom: 12px;"><input type="text" id="addCurrencyInput" placeholder="Enter new currency code"><button type="button" class="account-btn-add-currency" onclick="addCurrencyFromInput('add'); return false;">Create Currency</button></div>
              <div class="account-currency-list" id="addCurrencyList"></div>
            </div>
            <div class="account-other-currency" style="margin-top: 20px;"><label>Company:</label><div class="account-currency-list" id="addCompanyList"></div></div>
          </div>
        </div>
        <div class="account-form-actions"><button type="submit" class="account-btn account-btn-save">Add Account</button><button type="button" class="account-btn account-btn-cancel" onclick="closeAddModal()">Cancel</button></div>
      </form>
    </div>
  </div>
</div>
<div id="linkAccountModal" class="account-modal" style="display: none;">
  <div class="account-modal-content">
    <div class="account-modal-header"><h2>Link Account</h2><span class="account-close" onclick="closeLinkAccountModal()">&times;</span></div>
    <div class="link-account-fixed-area">
      <div class="link-type-section">
        <div class="link-type-pills">
          <label class="link-type-pill" id="linkTypeLabelBidirectional"><input type="radio" name="linkType" value="bidirectional" id="linkTypeBidirectional" checked class="link-type-radio"><span class="link-type-pill-check">&#10003;</span><span class="link-type-pill-text">Bidirectional</span></label>
          <label class="link-type-pill" id="linkTypeLabelUnidirectional"><input type="radio" name="linkType" value="unidirectional" id="linkTypeUnidirectional" class="link-type-radio"><span class="link-type-pill-check">&#10003;</span><span class="link-type-pill-text">Unidirectional</span></label>
        </div>
        <p class="link-type-desc" id="linkTypeDescription">Bidirectional: Data syncs both ways.</p>
      </div>
      <div class="link-account-search-wrap"><div class="link-account-search-inner"><svg class="link-account-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg><input type="text" id="linkAccountSearchInput" class="link-account-search-input" placeholder="Search account..." autocomplete="off"></div></div>
    </div>
    <div class="account-modal-body link-account-modal-body"><div id="linkAccountList" class="link-account-list"></div></div>
    <div class="account-form-actions link-account-form-actions"><button type="button" class="account-btn account-btn-save" onclick="saveAccountLinks()">Save</button><button type="button" class="account-btn account-btn-cancel" onclick="closeLinkAccountModal()">Cancel</button></div>
  </div>
</div>
<div id="currencySettingModal" class="currency-fullscreen-modal" style="display: none;">
  <div class="currency-fullscreen-modal-content">
    <div class="currency-fullscreen-modal-header-bar"><h2>Currency Setting</h2><button type="button" class="currency-btn-back" onclick="closeCurrencySettingModal()">Back</button></div>
    <div class="currency-fullscreen-modal-body">
      <div class="currency-left-panel">
        <div class="currency-setting-add-row-stacked" style="margin-top: 10px;"><label for="currencySettingAddInput">Add Currency :</label><div style="display: flex; gap: 10px; width: 100%;"><input type="text" id="currencySettingAddInput" class="currency-setting-input"><button type="button" class="account-btn account-btn-add currency-setting-add-btn" onclick="addCurrencyFromSettingModal()">Add</button></div></div>
        <div class="currency-setting-divider"></div>
        <div class="currency-setting-list-row-stacked"><label>Currency :</label><div class="currency-setting-pill-list" id="currencySettingPillList"></div></div>
      </div>
      <div class="currency-right-panel" style="padding-top: 24px;">
        <div class="currency-setting-filter-row">
          <div class="currency-setting-search-wrap"><svg class="currency-setting-search-icon" viewBox="0 0 24 24" fill="none" stroke="#ccc" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg><input type="text" id="currencySettingSearchInput" class="currency-setting-search-input" placeholder="Search Bar"></div>
          <div class="currency-setting-role-filter"><select id="currencySettingRoleSelect" class="currency-setting-select"><option value="">Filter Row</option></select></div>
        </div>
        <div class="currency-setting-selectall-row"><button type="button" id="currencySettingSelectAllBtn" class="account-btn currency-setting-selectall-btn" onclick="toggleSelectAllCurrencyAccounts()">Select All</button><span id="currencySettingSelectedCount" class="currency-setting-selected-count">0 selected</span></div>
        <div class="currency-setting-account-list" id="currencySettingAccountList"></div>
      </div>
    </div>
    <div class="currency-fullscreen-bottom-bar"><button type="button" class="account-btn account-btn-save currency-setting-submit-btn" onclick="saveCurrencySetting()">Save</button><button type="button" class="account-btn account-btn-cancel currency-setting-cancel-btn" onclick="closeCurrencySettingModal()">Cancel</button></div>
  </div>
</div>
<div id="confirmDeleteModal" class="account-modal" style="display: none;">
  <div class="account-confirm-modal-content">
    <div class="account-confirm-icon-container"><svg class="account-confirm-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg></div>
    <h2 class="account-confirm-title">Confirm Delete</h2>
    <p id="confirmDeleteMessage" class="account-confirm-message">This action cannot be undone.</p>
    <div class="account-confirm-actions"><button type="button" class="account-btn account-btn-cancel confirm-cancel" onclick="closeConfirmDeleteModal()">Cancel</button><button type="button" class="account-btn account-btn-delete confirm-delete" onclick="confirmDelete()">Delete</button></div>
  </div>
</div>
`;

export default function AccountListPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [currentCompanyId, setCurrentCompanyId] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);

  const groupIds = useMemo(
    () =>
      [...new Set(companies.filter((c) => c.group_id).map((c) => String(c.group_id).toUpperCase()))].sort(),
    [companies]
  );

  const visibleCompanies = useMemo(() => {
    if (!selectedGroup) {
      return companies.filter((c) => !c.group_id || String(c.group_id).trim() === "");
    }
    return companies.filter((c) => String(c.group_id || "").toUpperCase() === selectedGroup);
  }, [companies, selectedGroup]);

  useEffect(() => {
    document.body.classList.remove("bg");
    document.body.classList.add("account-page");
    const accountCss = document.createElement("link");
    accountCss.rel = "stylesheet";
    accountCss.href = assetUrl("css/account-list.css");
    document.head.appendChild(accountCss);

    const sharedCss = document.createElement("link");
    sharedCss.rel = "stylesheet";
    sharedCss.href = assetUrl("css/accountCSS.css");
    document.head.appendChild(sharedCss);

    (async () => {
      try {
        const meRes = await fetch(buildApiUrl("api/session/current_user_api.php"), { credentials: "include" });
        const meJson = await meRes.json();
        if (!meRes.ok || !meJson.success || !meJson.data) {
          navigate("/login", { replace: true });
          return;
        }
        if (String(meJson.data.user_type || "").toLowerCase() === "member") {
          window.location.assign(new URL("member.php", window.location.origin).href);
          return;
        }

        const companiesRes = await fetch(buildApiUrl("api/transactions/get_owner_companies_api.php?all=1"), {
          credentials: "include",
        });
        const companiesJson = await companiesRes.json();
        const rows = Array.isArray(companiesJson?.data) ? companiesJson.data : [];
        setCompanies(rows);

        const url = new URL(window.location.href);
        const companyFromQuery = url.searchParams.get("company_id");
        const effectiveCompanyId = companyFromQuery || meJson.data.company_id || rows[0]?.id || null;
        setCurrentCompanyId(effectiveCompanyId ? parseInt(effectiveCompanyId, 10) : null);

        const currentCompany = rows.find((r) => parseInt(r.id, 10) === parseInt(effectiveCompanyId, 10));
        setSelectedGroup(currentCompany?.group_id ? String(currentCompany.group_id).toUpperCase() : null);

        window.ACCOUNT_LIST_SHOW_INACTIVE = url.searchParams.get("showInactive") === "1";
        window.ACCOUNT_LIST_SHOW_ALL = url.searchParams.get("showAll") === "1";
        window.ACCOUNT_LIST_COMPANY_ID = effectiveCompanyId ? parseInt(effectiveCompanyId, 10) : null;
        window.ACCOUNT_LIST_SELECTED_COMPANY_IDS_FOR_ADD = effectiveCompanyId
          ? [parseInt(effectiveCompanyId, 10)]
          : [];
        window.onSharedCompanyFilterChanged = function onSharedCompanyFilterChanged(companyId, companyCode) {
          if (typeof window.switchAccountListCompany === "function") {
            window.switchAccountListCompany(companyId, companyCode);
          }
        };

        setReady(true);
      } catch {
        navigate("/login", { replace: true });
      }
    })();

    return () => {
      document.body.classList.remove("account-page");
      document.body.classList.add("bg");
      if (accountCss.parentNode) accountCss.parentNode.removeChild(accountCss);
      if (sharedCss.parentNode) sharedCss.parentNode.removeChild(sharedCss);
    };
  }, [navigate]);

  useEffect(() => {
    if (!ready) return;
    const sharedScriptId = "legacy-shared-company-filter-js";
    const accountScriptId = "legacy-account-list-js";

    const oldShared = document.getElementById(sharedScriptId);
    if (oldShared?.parentNode) oldShared.parentNode.removeChild(oldShared);
    const oldAccount = document.getElementById(accountScriptId);
    if (oldAccount?.parentNode) oldAccount.parentNode.removeChild(oldAccount);

    const sharedScript = document.createElement("script");
    sharedScript.id = sharedScriptId;
    sharedScript.src = assetUrl("js/shared_company_filter.js");

    const accountScript = document.createElement("script");
    accountScript.id = accountScriptId;
    accountScript.src = assetUrl("js/account-list.js");

    document.body.appendChild(sharedScript);
    document.body.appendChild(accountScript);
    document.dispatchEvent(new Event("DOMContentLoaded", { bubbles: true, cancelable: true }));

    return () => {
      const s1 = document.getElementById(sharedScriptId);
      const s2 = document.getElementById(accountScriptId);
      if (s1?.parentNode) s1.parentNode.removeChild(s1);
      if (s2?.parentNode) s2.parentNode.removeChild(s2);
    };
  }, [ready]);

  return (
    <>
      <div className="container">
        <div className="content">
          <h1 className="account-page-title">Account List</h1>
          <div className="account-separator-line" />
          <div className="account-action-buttons-container" style={{ marginBottom: "20px" }}>
            <div className="account-action-buttons" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <button className="account-btn account-btn-add" onClick={() => window.addAccount?.()}>Add Account</button>
                <div className="account-search-container">
                  <svg className="account-search-icon" fill="currentColor" viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zM9.5 14C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" /></svg>
                  <input type="text" id="searchInput" placeholder="Search by Account or Name" className="account-search-input" />
                </div>
                <div className="account-checkbox-section"><input type="checkbox" id="showInactive" name="showInactive" defaultChecked={window.ACCOUNT_LIST_SHOW_INACTIVE} /><label htmlFor="showInactive">Show Inactive</label></div>
                <div className="account-checkbox-section"><input type="checkbox" id="showAll" name="showAll" defaultChecked={window.ACCOUNT_LIST_SHOW_ALL} /><label htmlFor="showAll">Show All</label></div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <button className="account-btn account-btn-setting" onClick={() => window.openCurrencySettingModal?.()}>Currency Setting</button>
                <button className="account-btn account-btn-delete" id="accountDeleteSelectedBtn" onClick={() => window.deleteSelected?.()}>Delete</button>
              </div>
            </div>

            <div className="shared-company-filter">
              {groupIds.length > 0 && (
                <div className="transaction-company-filter" style={{ display: "flex" }}>
                  <span className="transaction-company-label">GroupID:</span>
                  <div className="transaction-company-buttons">
                    {groupIds.map((gid) => (
                      <button key={gid} type="button" className={`shared-group-btn transaction-company-btn${selectedGroup === gid ? " active" : ""}`} data-group-id={gid}>
                        {gid}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="transaction-company-filter" style={{ display: "flex" }}>
                <span className="transaction-company-label">Company:</span>
                <div className="transaction-company-buttons">
                  {visibleCompanies.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={`shared-company-btn transaction-company-btn${parseInt(c.id, 10) === parseInt(currentCompanyId, 10) ? " active" : ""}`}
                      data-company-id={c.id}
                      data-company-code={c.company_id}
                      data-group-id={c.group_id || ""}
                    >
                      {c.company_id}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="account-table-wrapper" id="accountTableWrapper">
            <div className="account-table-header">
              <div className="account-header-item">No</div>
              <div className="account-header-item account-header-sortable" onClick={() => window.sortByAccount?.()}>Account <span className="account-sort-indicator" id="sortAccountIndicator">▲</span></div>
              <div className="account-header-item">Name</div>
              <div className="account-header-item account-header-sortable" onClick={() => window.sortByRole?.()}>Role <span className="account-sort-indicator" id="sortRoleIndicator" /></div>
              <div className="account-header-item">Alert</div>
              <div className="account-header-item">Status</div>
              <div className="account-header-item">Last Login</div>
              <div className="account-header-item">Remark</div>
              <div className="account-header-item">Action <input type="checkbox" id="selectAllAccounts" onChange={() => window.toggleSelectAllAccounts?.()} style={{ marginLeft: "10px", cursor: "pointer" }} /></div>
            </div>
            <div className="account-cards" id="accountTableBody"><div className="account-card"><div className="account-card-item">Loading...</div></div></div>
          </div>
          <div className="account-pagination-container" id="paginationContainer">
            <button className="account-pagination-btn" id="prevBtn" onClick={() => window.changeAccountListPageBy?.(-1)}>◀</button>
            <span className="account-pagination-info" id="paginationInfo">1 of 1</span>
            <button className="account-pagination-btn" id="nextBtn" onClick={() => window.changeAccountListPageBy?.(1)}>▶</button>
          </div>
        </div>
      </div>
      <div dangerouslySetInnerHTML={{ __html: MODALS_HTML }} />
    </>
  );
}

