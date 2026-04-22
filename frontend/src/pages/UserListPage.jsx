import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { assetUrl, buildApiUrl } from "../utils/apiUrl.js";

function roleBadgeClass(role) {
  const r = String(role || "").replace(/\s+/g, "-").toLowerCase();
  return `role-badge role-${r}`;
}

export default function UserListPage() {
  const [searchParams] = useSearchParams();
  const [bootstrap, setBootstrap] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [scriptsReady, setScriptsReady] = useState(false);

  const queryString = useMemo(() => {
    const q = new URLSearchParams();
    const cid = searchParams.get("company_id");
    if (cid) q.set("company_id", cid);
    if (searchParams.get("showAll")) q.set("showAll", "1");
    const s = q.toString();
    return s ? `?${s}` : "";
  }, [searchParams]);

  useEffect(() => {
    document.body.classList.add("user-page");
    return () => {
      document.body.classList.remove("user-page");
      document.body.classList.remove("user-page--show-all");
    };
  }, []);

  useEffect(() => {
    setScriptsReady(false);
  }, [queryString]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadError("");
      try {
        const res = await fetch(buildApiUrl(`api/users/userlist_bootstrap_api.php${queryString}`), { credentials: "include" });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok || !json.success) {
          setLoadError(json.message || "Failed to load user list");
          setBootstrap(null);
          return;
        }
        setBootstrap(json.data);
      } catch (e) {
        if (!cancelled) setLoadError(e.message || "Network error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [queryString]);

  const applyWindowGlobals = useCallback((data) => {
    window.USERLIST_CURRENT_USER_ID = data.current_user_id;
    window.USERLIST_CURRENT_USER_ROLE = data.current_user_role || "";
    window.USERLIST_CURRENT_COMPANY_ID = data.current_company_id;
    window.USERLIST_SHOW_ALL = !!data.show_all;
  }, []);

  const wireCompanyFilterCallback = useCallback(() => {
    window.onSharedCompanyFilterChanged = function (companyId, companyCode) {
      if (typeof window.switchUserListCompany === "function") {
        window.switchUserListCompany(companyId, companyCode);
      }
    };
  }, []);

  useEffect(() => {
    if (!bootstrap) return;

    const sharedId = "legacy-shared-company-filter-js";
    const userlistId = "legacy-userlist-js";
    const v = bootstrap.userlist_js_mtime || Date.now();

    const ensureUserlistScript = () => {
      const existing = document.getElementById(userlistId);
      if (existing) {
        setScriptsReady(true);
        return;
      }
      if (!document.getElementById("legacy-userlist-pre-js")) {
        const pre = document.createElement("script");
        pre.id = "legacy-userlist-pre-js";
        pre.textContent = "window.USERLIST_SKIP_AUTO_INIT=true;";
        document.body.appendChild(pre);
      }
      const s = document.createElement("script");
      s.id = userlistId;
      s.src = assetUrl(`js/userlist.js?v=${v}`);
      s.onload = () => setScriptsReady(true);
      s.onerror = () => setLoadError("Failed to load userlist.js");
      document.body.appendChild(s);
    };

    const existingShared = document.getElementById(sharedId);
    if (existingShared) {
      ensureUserlistScript();
    } else {
      const s1 = document.createElement("script");
      s1.id = sharedId;
      s1.src = assetUrl(`js/shared_company_filter.js?v=${v}`);
      s1.onload = () => ensureUserlistScript();
      s1.onerror = () => setLoadError("Failed to load shared_company_filter.js");
      document.body.appendChild(s1);
    }

    return () => {
      setScriptsReady(false);
      delete window.onSharedCompanyFilterChanged;
    };
  }, [bootstrap]);

  useEffect(() => {
    if (!bootstrap || !scriptsReady) return;
    applyWindowGlobals(bootstrap);
    wireCompanyFilterCallback();
    if (typeof window.initSharedCompanyFilter === "function") window.initSharedCompanyFilter();
    if (typeof window.initUserListPageAfterDomReady === "function") window.initUserListPageAfterDomReady();
  }, [bootstrap, scriptsReady, applyWindowGlobals, wireCompanyFilterCallback]);

  useEffect(() => {
    const ids = ["legacy-css-userlist", "legacy-css-global-13"];
    const hrefs = ["/css/userlist.css", "/css/global-13inch.css"];
    hrefs.forEach((href, i) => {
      if (document.getElementById(ids[i])) return;
      const l = document.createElement("link");
      l.id = ids[i];
      l.rel = "stylesheet";
      l.href = assetUrl(href.replace(/^\//, ""));
      document.head.appendChild(l);
    });
  }, []);

  const users = bootstrap?.users || [];
  const accounts = bootstrap?.accounts || [];
  const processes = bootstrap?.processes || [];
  const isC168 = !!bootstrap?.is_c168_company;

  if (loadError && !bootstrap) {
    return (
      <div className="container">
        <div className="content">
          <h1>User List</h1>
          <p style={{ color: "#b91c1c" }}>{loadError}</p>
        </div>
      </div>
    );
  }

  if (!bootstrap) return null;

  return (
    <>
      <div id="notificationContainer" className="notification-container" />
      <div className="container">
        <div className="content">
          <h1>User List</h1>

          <div className="separator-line" />

          <div className="action-buttons-container" style={{ marginBottom: 20 }}>
            <div className="action-buttons" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button type="button" className="btn btn-add" onClick={() => window.openAddModal?.()}>
                  Add User
                </button>
                <div className="search-container">
                  <svg className="search-icon" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
                  </svg>
                  <input type="text" id="searchInput" placeholder="Search by Login Id or Name" className="search-input" />
                </div>
                <div className="checkbox-section">
                  <input type="checkbox" id="showInactive" name="showInactive" />
                  <label htmlFor="showInactive">Show Inactive</label>
                </div>
                <div className="checkbox-section">
                  <input type="checkbox" id="showAll" name="showAll" defaultChecked={bootstrap.show_all} />
                  <label htmlFor="showAll">Show All</label>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button type="button" className="btn btn-delete" id="deleteSelectedBtn" onClick={() => window.deleteSelected?.()}>
                  Delete
                </button>
              </div>
            </div>

            <div id="user-list-company-filter-wrapper" style={{ padding: "0 20px 15px 20px", width: "100%", overflowX: "auto", boxSizing: "border-box" }} dangerouslySetInnerHTML={{ __html: bootstrap.company_filter_html || "" }} />
          </div>

          <div className="user-table-wrapper" id="userTableWrapper">
            <div className="table-header">
              <div className="header-item">No</div>
              <div className="header-item header-sortable" onClick={() => window.sortByLoginId?.()} role="presentation">
                Login Id
                <span className="sort-indicator" id="sortLoginIdIndicator">
                  ▲
                </span>
              </div>
              <div className="header-item">Name</div>
              <div className="header-item">Email</div>
              <div className="header-item header-sortable" onClick={() => window.sortByRole?.()} role="presentation">
                Role
                <span className="sort-indicator" id="sortRoleIndicator" />
              </div>
              <div className="header-item">Status</div>
              <div className="header-item">Last Login</div>
              <div className="header-item">Created By</div>
              <div className="header-item">
                Action
                <input type="checkbox" id="selectAllUsers" title="Select all" style={{ marginLeft: 10, cursor: "pointer" }} onChange={() => window.toggleSelectAllUsers?.()} />
              </div>
            </div>

            <div className="user-cards" id="userTableBody">
              {users.map((user, index) => {
                const isOwnerShadow = user.is_owner_shadow === 1;
                const isActive = String(user.status || "").toLowerCase() === "active";
                const canToggle = user.can_toggle_status;
                const canEdit = user.can_edit_delete;
                const canDelete = user.can_delete;
                const roleUpper = String(user.role || "").toUpperCase();
                const statusUpper = String(user.status || "").toUpperCase();
                const createdBy = user.created_by ? String(user.created_by).toUpperCase() : "-";
                return (
                  <div
                    key={`${user.id}-${isOwnerShadow ? "os" : "u"}`}
                    className={`user-card ${index % 2 === 0 ? "row-even" : "row-odd"}`}
                    data-id={user.id}
                    data-is-owner-shadow={isOwnerShadow ? "1" : "0"}
                    data-login-id={user.login_id}
                    data-name={user.name}
                    data-email={user.email || ""}
                    data-role={user.role}
                    data-status={user.status}
                    data-last-login={user.last_login || ""}
                    data-created-by={user.created_by || ""}
                  >
                    <div className="card-item">{index + 1}</div>
                    <div className="card-item">{user.login_id}</div>
                    <div className="card-item">{user.name}</div>
                    <div className="card-item">{user.email || "-"}</div>
                    <div className="card-item uppercase-text">
                      <span className={roleBadgeClass(user.role)}>{roleUpper}</span>
                    </div>
                    <div className="card-item uppercase-text">
                      {canToggle ? (
                        <span
                          className={`role-badge ${isActive ? "status-active" : "status-inactive"} status-clickable`}
                          onClick={() => window.toggleUserStatus?.(user.id, user.status, isOwnerShadow)}
                          title="Click to toggle status"
                          style={{ cursor: "pointer" }}
                          role="presentation"
                        >
                          {statusUpper}
                        </span>
                      ) : (
                        <span
                          className={`role-badge ${isActive ? "status-active" : "status-inactive"}`}
                          style={{ cursor: "not-allowed", opacity: 0.6 }}
                          title="No permission to toggle status"
                        >
                          {statusUpper}
                        </span>
                      )}
                    </div>
                    <div className="card-item">{user.last_login || "-"}</div>
                    <div className="card-item uppercase-text">{createdBy}</div>
                    <div className="card-item">
                      {canEdit ? (
                        <button type="button" className="btn btn-edit edit-btn" onClick={() => window.editUser?.(user.id, isOwnerShadow)} aria-label="Edit">
                          <img src="/images/edit.svg" alt="" />
                        </button>
                      ) : (
                        <button type="button" className="btn btn-edit edit-btn" disabled style={{ opacity: 0.3, cursor: "not-allowed" }} aria-label="Edit Disabled">
                          <img src="/images/edit.svg" alt="" />
                        </button>
                      )}
                      {!isActive &&
                        (canDelete ? (
                          <input
                            type="checkbox"
                            className="user-checkbox"
                            value={user.id}
                            data-is-owner-shadow={isOwnerShadow ? "1" : "0"}
                            data-role={String(user.role || "").toLowerCase()}
                            onChange={() => window.updateDeleteButton?.()}
                          />
                        ) : (
                          <input type="checkbox" className="user-checkbox" disabled style={{ opacity: 0.3, cursor: "not-allowed" }} title="No permission to delete" />
                        ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pagination-container" id="paginationContainer">
            <button type="button" className="pagination-btn" id="prevBtn" onClick={() => window.changePage?.(-1)}>
              ◀
            </button>
            <span className="pagination-info" id="paginationInfo">
              1 of 1
            </span>
            <button type="button" className="pagination-btn" id="nextBtn" onClick={() => window.changePage?.(1)}>
              ▶
            </button>
          </div>
        </div>
      </div>

      <div id="confirmModal" className="modal">
        <div className="confirm-modal-content">
          <div className="confirm-icon-container">
            <svg className="confirm-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="confirm-title">Confirm Delete</h2>
          <p id="confirmMessage" className="confirm-message" />
          <div className="confirm-actions">
            <button type="button" className="btn btn-cancel confirm-cancel" onClick={() => window.closeConfirmModal?.()}>
              Cancel
            </button>
            <button type="button" className="btn btn-delete confirm-delete" id="confirmDeleteBtn">
              Delete
            </button>
          </div>
        </div>
      </div>

      <div id="userModal" className="modal">
        <div className="modal-content">
          <div className="modal-header-bar">
            <h2 id="modalTitle">Edit User</h2>
            <button type="button" className="btn-back" onClick={() => window.closeModal?.()}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Back
            </button>
          </div>

          <div className="modal-body">
            <div className="user-info-panel">
              <h3>User Information</h3>
              <form id="userForm">
                <input type="hidden" id="userId" name="id" />
                <input type="hidden" id="status" name="status" value="active" />
                <div className="user-info-grid">
                  <div className="form-group user-info-field">
                    <label htmlFor="login_id">Login ID *</label>
                    <input type="text" id="login_id" name="login_id" required />
                  </div>

                  {isC168 ? (
                    <>
                      <div className="form-group user-info-field password-row-container" id="passwordRowContainer">
                        <div className="password-field-wrapper" id="passwordGroup">
                          <label htmlFor="password">Password *</label>
                          <input type="password" id="password" name="password" />
                        </div>
                        <div className="password-field-wrapper" id="secondaryPasswordGroup">
                          <label htmlFor="secondary_password">Secondary Password (6 digits)</label>
                          <input type="password" id="secondary_password" name="secondary_password" maxLength={6} pattern="[0-9]{6}" placeholder="Enter 6-digit password" />
                        </div>
                      </div>
                      <div className="form-group user-info-field" style={{ marginTop: -10, marginBottom: 10 }}>
                        <small style={{ color: "#64748b", fontSize: 12, display: "block" }} />
                      </div>
                    </>
                  ) : (
                    <div className="form-group user-info-field" id="passwordGroup">
                      <label htmlFor="password">Password *</label>
                      <input type="password" id="password" name="password" />
                    </div>
                  )}

                  <div className="form-group user-info-field">
                    <label htmlFor="name">Name *</label>
                    <input type="text" id="name" name="name" required />
                  </div>
                  <div className="form-group user-info-field">
                    <label htmlFor="role">Role *</label>
                    <select id="role" name="role" required defaultValue="">
                      <option value="">Select Role</option>
                      <option value="partnership">Partnership</option>
                      <option value="admin">Admin</option>
                      <option value="manager">Manager</option>
                      <option value="supervisor">Supervisor</option>
                      <option value="accountant">Accountant</option>
                      <option value="audit">Audit</option>
                      <option value="customer service">Customer Service</option>
                      <option value="company">Company</option>
                    </select>
                  </div>
                  <div className="form-group user-info-field">
                    <label htmlFor="email">Email *</label>
                    <input type="email" id="email" name="email" required />
                  </div>
                  <div className="form-group user-info-field company-field-group">
                    <label>Company *</label>
                    <div id="user-company-buttons-container" className="transaction-company-buttons" style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }} />
                  </div>
                </div>

                <div id="sidebarPermissionsWrapper" className="sidebar-permissions-section">
                  <h3 className="sidebar-permissions-title">
                    Permissions
                    <span id="readOnlyToggleWrapper" className="read-only-toggle-inline" style={{ display: "none" }}>
                      <span className="read-only-label">Read Only</span>
                      <label className="toggle-switch" id="readOnlyToggleLabel" htmlFor="readOnlyToggle">
                        <input type="checkbox" id="readOnlyToggle" name="read_only" value="1" defaultChecked />
                        <span className="toggle-slider" />
                      </label>
                    </span>
                  </h3>
                  <div className="permissions-container">
                    {[
                      ["home", "M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z", "Home"],
                      ["admin", "M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z", "Admin"],
                      ["account", "M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z", "Account"],
                      ["process", "M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z", "Process"],
                      ["datacapture", "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z", "Data Capture"],
                      ["payment", "M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z", "Transaction Payment"],
                      ["report", "M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 2 2h8c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z", "Report"],
                      ["maintenance", "M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z", "Maintenance"],
                    ].map(([val, d, label]) => (
                      <div key={val} className="permission-item">
                        <label className="permission-label" htmlFor={`perm_${val}`}>
                          <input type="checkbox" id={`perm_${val}`} name="permissions[]" value={val} className="permission-checkbox" />
                          <span className="permission-name">
                            <svg className="permission-icon" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                              <path d={d} />
                            </svg>
                            {label}
                          </span>
                        </label>
                      </div>
                    ))}
                  </div>
                  <div className="permissions-actions">
                    <button type="button" className="btn-secondary" onClick={() => window.selectAllPermissions?.()}>
                      Select All
                    </button>
                    <button type="button" className="btn-clearall" onClick={() => window.clearAllPermissions?.()}>
                      Clear All
                    </button>
                  </div>
                </div>

                <div className="form-actions add-mode-actions">
                  <button type="submit" className="btn btn-save">
                    Save
                  </button>
                  <button type="button" className="btn btn-cancel" onClick={() => window.closeModal?.()}>
                    Cancel
                  </button>
                </div>
              </form>
            </div>

            <div className="permissions-panel" id="editModeRightPanel" style={{ display: "none" }}>
              <div id="accountProcessPermissionsSection">
                <div className="account-process-col">
                  <span className="acc-proc-label">Account</span>
                  <div className="account-grid" id="accountGrid">
                    {accounts.map((account) => (
                      <div
                        key={account.id}
                        className="account-item-compact"
                        data-search={String(account.account_id || "").toLowerCase()}
                        style={{ display: "flex", alignItems: "center", padding: "clamp(0px, 0.1vw, 2px) clamp(2px, 0.21vw, 4px)", borderRadius: 4, backgroundColor: "white", border: "1px solid #eee" }}
                      >
                        <input
                          type="checkbox"
                          id={`account_${account.id}`}
                          value={account.id}
                          data-account-id={account.account_id}
                          onChange={() => window.updateAccountSelection?.()}
                          style={{ margin: "1px 3px 1px 4px", width: "clamp(8px, 0.73vw, 14px)", height: "clamp(8px, 0.73vw, 14px)", flexShrink: 0 }}
                        />
                        <label htmlFor={`account_${account.id}`} className="account-label" style={{ fontSize: "small", fontWeight: 800, color: "#333", cursor: "pointer", flex: 1, minWidth: 0, wordBreak: "break-all", lineHeight: 1.2 }}>
                          {account.account_id}
                        </label>
                      </div>
                    ))}
                  </div>
                  <div className="account-control-buttons">
                    <button type="button" className="btn-account-control" onClick={() => window.selectAllAccounts?.()}>
                      Select All
                    </button>
                    <button type="button" className="btn-clearall" onClick={() => window.clearAllAccounts?.()}>
                      Clear All
                    </button>
                  </div>
                </div>

                <div className="account-process-col">
                  <span className="acc-proc-label">Process</span>
                  <div className="account-grid" id="processGrid">
                    {processes.map((process) => (
                      <div
                        key={process.id}
                        className="account-item-compact"
                        data-search={String(`${process.process_id || ""} ${process.description || ""}`).toLowerCase()}
                        style={{ display: "flex", alignItems: "center", padding: "clamp(0px, 0.1vw, 2px) clamp(2px, 0.21vw, 4px)", borderRadius: 4, backgroundColor: "white", border: "1px solid #eee" }}
                      >
                        <input
                          type="checkbox"
                          id={`process_${process.id}`}
                          value={process.id}
                          data-process-name={process.process_id}
                          data-process-description={process.description || ""}
                          onChange={() => window.updateProcessSelection?.()}
                          style={{ margin: "1px 3px 1px 4px", width: "clamp(8px, 0.73vw, 14px)", height: "clamp(8px, 0.73vw, 14px)", flexShrink: 0 }}
                        />
                        <label htmlFor={`process_${process.id}`} className="account-label" style={{ fontSize: "small", fontWeight: 800, color: "#333", cursor: "pointer", flex: 1, minWidth: 0, wordBreak: "break-all", lineHeight: 1.2 }}>
                          {process.process_id}
                          {process.description ? (
                            <>
                              <br />
                              {process.description}
                            </>
                          ) : null}
                        </label>
                      </div>
                    ))}
                  </div>
                  <div className="account-control-buttons">
                    <button type="button" className="btn-account-control" onClick={() => window.selectAllProcesses?.()}>
                      Select All
                    </button>
                    <button type="button" className="btn-clearall" onClick={() => window.clearAllProcesses?.()}>
                      Clear All
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="edit-mode-bottom-bar" id="editModeBottomBar" style={{ display: "none" }}>
            <button type="submit" form="userForm" className="btn btn-save">
              Save
            </button>
            <button type="button" className="btn btn-cancel" onClick={() => window.closeModal?.()}>
              Cancel
            </button>
          </div>
        </div>
      </div>

      {loadError && scriptsReady && (
        <div className="container" style={{ marginTop: 8 }}>
          <p style={{ color: "#b91c1c" }}>{loadError}</p>
        </div>
      )}
    </>
  );
}
