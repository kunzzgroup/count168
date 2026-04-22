import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { buildApiUrl } from "../utils/apiUrl.js";

function fmtLastLogin(v) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "-";
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yy}-${mm}-${dd} ${hh}:${mi}`;
}

export default function UserListPage() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    document.body.classList.remove("bg");
    document.body.classList.add("dashboard-page", "user-page");

    const userlistCss = document.createElement("link");
    userlistCss.rel = "stylesheet";
    userlistCss.href = "/css/userlist.css";
    document.head.appendChild(userlistCss);

    const globalCss = document.createElement("link");
    globalCss.rel = "stylesheet";
    globalCss.href = "/css/global-13inch.css";
    document.head.appendChild(globalCss);

    (async () => {
      try {
        const meRes = await fetch(buildApiUrl("api/session/current_user_api.php"), { credentials: "include" });
        const meJson = await meRes.json();
        if (!meRes.ok || !meJson.success || !meJson.data) return navigate("/login", { replace: true });
        const perms = Array.isArray(meJson.data.permissions) ? meJson.data.permissions : [];
        if (perms.length > 0 && !perms.includes("admin")) return navigate("/dashboard", { replace: true });

        const url = new URL(window.location.href);
        const companyId = url.searchParams.get("company_id");
        const showAll = url.searchParams.get("showAll");
        const qs = new URLSearchParams();
        if (companyId) qs.set("company_id", companyId);
        if (showAll) qs.set("showAll", showAll);

        const res = await fetch(buildApiUrl(`api/users/userlist_bootstrap_api.php?${qs.toString()}`), { credentials: "include" });
        const json = await res.json();
        if (!res.ok || !json.success || !json.data) {
          setLoadError(json.message || "Failed to load user list");
          return;
        }

        window.USERLIST_CURRENT_USER_ID = json.data.current_user_id;
        window.USERLIST_CURRENT_USER_ROLE = String(json.data.current_user_role || "").toLowerCase();
        window.USERLIST_CURRENT_COMPANY_ID = json.data.current_company_id;
        window.USERLIST_SHOW_ALL = !!json.data.show_all;
        setData(json.data);
      } catch {
        setLoadError("Failed to load user list");
      }
    })();

    return () => {
      document.body.classList.remove("dashboard-page", "user-page", "user-page--show-all");
      document.body.classList.add("bg");
      if (userlistCss.parentNode) userlistCss.parentNode.removeChild(userlistCss);
      if (globalCss.parentNode) globalCss.parentNode.removeChild(globalCss);
    };
  }, [navigate]);

  useEffect(() => {
    if (!data) return;
    window.onSharedCompanyFilterChanged = function onSharedCompanyFilterChanged(companyId, companyCode) {
      if (typeof window.switchUserListCompany === "function") {
        window.switchUserListCompany(companyId, companyCode);
      }
    };
    const id = "legacy-userlist-js";
    const init = () => {
      document.dispatchEvent(new Event("DOMContentLoaded", { bubbles: true, cancelable: true }));
    };
    const exist = document.getElementById(id);
    if (exist) {
      init();
      return;
    }
    const s = document.createElement("script");
    s.id = id;
    s.src = "/js/userlist.js";
    s.onload = init;
    document.body.appendChild(s);
  }, [data]);

  useEffect(() => {
    if (!data) return;
    const id = "shared-company-filter-js";
    const existing = document.getElementById(id);
    if (existing) {
      document.dispatchEvent(new Event("DOMContentLoaded", { bubbles: true, cancelable: true }));
      return;
    }
    const s = document.createElement("script");
    s.id = id;
    s.src = "/js/shared_company_filter.js";
    s.onload = () => {
      document.dispatchEvent(new Event("DOMContentLoaded", { bubbles: true, cancelable: true }));
    };
    document.body.appendChild(s);
  }, [data]);

  const users = useMemo(() => (Array.isArray(data?.users) ? data.users : []), [data]);
  const companies = useMemo(() => (Array.isArray(data?.companies) ? data.companies : []), [data]);
  const accounts = useMemo(() => (Array.isArray(data?.accounts) ? data.accounts : []), [data]);
  const processes = useMemo(() => (Array.isArray(data?.processes) ? data.processes : []), [data]);
  const groups = useMemo(() => {
    const set = new Set();
    companies.forEach((c) => {
      const gid = String(c.group_id || "").trim().toUpperCase();
      if (gid) set.add(gid);
    });
    return Array.from(set).sort();
  }, [companies]);
  const activeGroupId = useMemo(() => {
    const current = companies.find((c) => Number(c.id) === Number(data?.current_company_id));
    return String(current?.group_id || "").trim().toUpperCase();
  }, [companies, data?.current_company_id]);

  return (
    <div className="container">
      <div id="notificationContainer" className="notification-container" />
      <div className="content">
        <h1>User List</h1>
        {loadError && <div style={{ color: "#b91c1c", marginBottom: 10 }}>{loadError}</div>}
        <div className="separator-line" />
        <div className="action-buttons-container" style={{ marginBottom: 20 }}>
          <div className="action-buttons" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button className="btn btn-add" onClick={() => window.openAddModal?.()}>Add User</button>
              <div className="search-container">
                <svg className="search-icon" fill="currentColor" viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5z" /></svg>
                <input type="text" id="searchInput" placeholder="Search by Login Id or Name" className="search-input" />
              </div>
              <div className="checkbox-section"><input type="checkbox" id="showInactive" /><label htmlFor="showInactive">Show Inactive</label></div>
              <div className="checkbox-section"><input type="checkbox" id="showAll" defaultChecked={!!data?.show_all} /><label htmlFor="showAll">Show All</label></div>
            </div>
            <button className="btn btn-delete" id="deleteSelectedBtn" onClick={() => window.deleteSelected?.()}>Delete</button>
          </div>
          <div style={{ padding: "0 20px 15px 20px" }}>
            {groups.length > 0 && (
              <div id="group-buttons-wrapper" className="transaction-company-filter shared-group-wrapper">
                <span className="transaction-company-label">GroupID:</span>
                <div id="group-buttons-container" className="transaction-company-buttons">
                  {groups.map((gid) => (
                    <button type="button" key={gid} className={`transaction-company-btn shared-group-btn ${activeGroupId === gid ? "active" : ""}`} data-group-id={gid}>
                      {gid}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div id="company-buttons-wrapper" className="transaction-company-filter shared-company-wrapper">
              <span className="transaction-company-label">Company:</span>
              <div id="company-buttons-container" className="transaction-company-buttons">
                {companies.map((c) => (
                  <button
                    type="button"
                    key={c.id}
                    className={`transaction-company-btn shared-company-btn${Number(c.id) === Number(data?.current_company_id) ? " active" : ""}`}
                    style={groups.length > 0 ? (activeGroupId ? { display: String(c.group_id || "").toUpperCase() === activeGroupId ? "" : "none" } : { display: !String(c.group_id || "").trim() ? "" : "none" }) : undefined}
                    data-company-id={c.id}
                    data-group-id={String(c.group_id || "").trim().toUpperCase()}
                    data-company-code={c.company_id}
                    onClick={() => window.onSharedCompanyFilterChanged?.(c.id, c.company_id)}
                  >
                    {c.company_id}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="user-table-wrapper" id="userTableWrapper">
          <div className="table-header">
            <div className="header-item">No</div><div className="header-item header-sortable" onClick={() => window.sortByLoginId?.()}>Login Id <span className="sort-indicator" id="sortLoginIdIndicator">▲</span></div>
            <div className="header-item">Name</div><div className="header-item">Email</div><div className="header-item header-sortable" onClick={() => window.sortByRole?.()}>Role <span className="sort-indicator" id="sortRoleIndicator" /></div>
            <div className="header-item">Status</div><div className="header-item">Last Login</div><div className="header-item">Created By</div>
            <div className="header-item">Action<input type="checkbox" id="selectAllUsers" onChange={() => window.toggleSelectAllUsers?.()} style={{ marginLeft: 10 }} /></div>
          </div>
          <div className="user-cards" id="userTableBody">
            {users.map((u, i) => (
              <div
                key={`${u.id}-${i}`}
                className={`user-card show-card ${i % 2 === 0 ? "row-even" : "row-odd"}`}
                data-id={u.id}
                data-is-owner-shadow={Number(u.is_owner_shadow) === 1 ? "1" : "0"}
                data-login-id={u.login_id || ""}
                data-name={u.name || ""}
                data-email={u.email || ""}
                data-role={u.role || ""}
                data-status={u.status || ""}
                data-last-login={fmtLastLogin(u.last_login)}
                data-created-by={u.created_by || ""}
              >
                <div className="card-item">{i + 1}</div>
                <div className="card-item">{u.login_id}</div>
                <div className="card-item">{u.name}</div>
                <div className="card-item">{u.email || "-"}</div>
                <div className="card-item uppercase-text"><span className={`role-badge role-${String(u.role || "").replace(/\s+/g, "-")}`}>{String(u.role || "").toUpperCase()}</span></div>
                <div className="card-item uppercase-text"><span className={`role-badge ${String(u.status).toLowerCase() === "active" ? "status-active" : "status-inactive"} status-clickable`} onClick={() => window.toggleUserStatus?.(u.id, u.status, Number(u.is_owner_shadow) === 1)}>{String(u.status || "").toUpperCase()}</span></div>
                <div className="card-item">{fmtLastLogin(u.last_login)}</div>
                <div className="card-item uppercase-text">{String(u.created_by || "-").toUpperCase()}</div>
                <div className="card-item"><button className="btn btn-edit edit-btn" onClick={() => window.editUser?.(u.id, Number(u.is_owner_shadow) === 1)}><img src="/images/edit.svg" alt="Edit" /></button></div>
              </div>
            ))}
          </div>
        </div>
        <div className="pagination-container" id="paginationContainer"><button className="pagination-btn" id="prevBtn" onClick={() => window.changePage?.(-1)}>◀</button><span className="pagination-info" id="paginationInfo">1 of 1</span><button className="pagination-btn" id="nextBtn" onClick={() => window.changePage?.(1)}>▶</button></div>
      </div>

      <div id="confirmModal" className="modal"><div className="confirm-modal-content"><div className="confirm-icon-container"><svg className="confirm-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg></div><h2 className="confirm-title">Confirm Delete</h2><p id="confirmMessage" className="confirm-message" /><div className="confirm-actions"><button type="button" className="btn btn-cancel confirm-cancel" onClick={() => window.closeConfirmModal?.()}>Cancel</button><button type="button" className="btn btn-delete confirm-delete" id="confirmDeleteBtn">Delete</button></div></div></div>

      <div id="userModal" className="modal">
        <div className="modal-content">
          <div className="modal-header-bar"><h2 id="modalTitle">Edit User</h2><button type="button" className="btn-back" onClick={() => window.closeModal?.()}>Back</button></div>
          <div className="modal-body">
            <div className="user-info-panel">
              <h3>User Information</h3>
              <form id="userForm">
                <input type="hidden" id="userId" name="id" />
                <input type="hidden" id="status" name="status" defaultValue="active" />
                <div className="user-info-grid">
                  <div className="form-group user-info-field"><label htmlFor="login_id">Login ID *</label><input type="text" id="login_id" name="login_id" required /></div>
                  {data?.is_c168_company ? (
                    <div className="form-group user-info-field password-row-container" id="passwordRowContainer">
                      <div className="password-field-wrapper" id="passwordGroup"><label htmlFor="password">Password *</label><input type="password" id="password" name="password" /></div>
                      <div className="password-field-wrapper" id="secondaryPasswordGroup"><label htmlFor="secondary_password">Secondary Password (6 digits)</label><input type="password" id="secondary_password" name="secondary_password" maxLength={6} /></div>
                    </div>
                  ) : (
                    <div className="form-group user-info-field" id="passwordGroup"><label htmlFor="password">Password *</label><input type="password" id="password" name="password" /></div>
                  )}
                  <div className="form-group user-info-field"><label htmlFor="name">Name *</label><input type="text" id="name" name="name" required /></div>
                  <div className="form-group user-info-field"><label htmlFor="role">Role *</label><select id="role" name="role" required><option value="">Select Role</option><option value="partnership">Partnership</option><option value="admin">Admin</option><option value="manager">Manager</option><option value="supervisor">Supervisor</option><option value="accountant">Accountant</option><option value="audit">Audit</option><option value="customer service">Customer Service</option><option value="company">Company</option></select></div>
                  <div className="form-group user-info-field"><label htmlFor="email">Email *</label><input type="email" id="email" name="email" required /></div>
                  <div className="form-group user-info-field company-field-group"><label>Company *</label><div id="user-company-buttons-container" className="transaction-company-buttons" /></div>
                </div>
                <div id="sidebarPermissionsWrapper" className="sidebar-permissions-section">
                  <h3 className="sidebar-permissions-title">Permissions <span id="readOnlyToggleWrapper" className="read-only-toggle-inline" style={{ display: "none" }}><span className="read-only-label">Read Only</span><label className="toggle-switch"><input type="checkbox" id="readOnlyToggle" name="read_only" value="1" defaultChecked /><span className="toggle-slider" /></label></span></h3>
                  <div className="permissions-container">
                    <div className="permission-item"><label className="permission-label"><input type="checkbox" name="permissions[]" value="home" className="permission-checkbox" /><span className="permission-name"><svg className="permission-icon" fill="currentColor" viewBox="0 0 24 24"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" /></svg>Home</span></label></div>
                    <div className="permission-item"><label className="permission-label"><input type="checkbox" name="permissions[]" value="admin" className="permission-checkbox" /><span className="permission-name"><svg className="permission-icon" fill="currentColor" viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" /></svg>Admin</span></label></div>
                    <div className="permission-item"><label className="permission-label"><input type="checkbox" name="permissions[]" value="account" className="permission-checkbox" /><span className="permission-name"><svg className="permission-icon" fill="currentColor" viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" /></svg>Account</span></label></div>
                    <div className="permission-item"><label className="permission-label"><input type="checkbox" name="permissions[]" value="process" className="permission-checkbox" /><span className="permission-name"><svg className="permission-icon" fill="currentColor" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg>Process</span></label></div>
                    <div className="permission-item"><label className="permission-label"><input type="checkbox" name="permissions[]" value="datacapture" className="permission-checkbox" /><span className="permission-name"><svg className="permission-icon" fill="currentColor" viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z" /></svg>Data Capture</span></label></div>
                    <div className="permission-item"><label className="permission-label"><input type="checkbox" name="permissions[]" value="payment" className="permission-checkbox" /><span className="permission-name"><svg className="permission-icon" fill="currentColor" viewBox="0 0 24 24"><path d="M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z" /></svg>Transaction Payment</span></label></div>
                    <div className="permission-item"><label className="permission-label"><input type="checkbox" name="permissions[]" value="report" className="permission-checkbox" /><span className="permission-name"><svg className="permission-icon" fill="currentColor" viewBox="0 0 24 24"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 2 2h8c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" /></svg>Report</span></label></div>
                    <div className="permission-item"><label className="permission-label"><input type="checkbox" name="permissions[]" value="maintenance" className="permission-checkbox" /><span className="permission-name"><svg className="permission-icon" fill="currentColor" viewBox="0 0 24 24"><path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z" /></svg>Maintenance</span></label></div>
                  </div>
                  <div className="permissions-actions"><button type="button" className="btn-secondary" onClick={() => window.selectAllPermissions?.()}>Select All</button><button type="button" className="btn-clearall" onClick={() => window.clearAllPermissions?.()}>Clear All</button></div>
                </div>
                <div className="form-actions add-mode-actions"><button type="submit" className="btn btn-save">Save</button><button type="button" className="btn btn-cancel" onClick={() => window.closeModal?.()}>Cancel</button></div>
              </form>
            </div>
            <div className="permissions-panel" id="editModeRightPanel" style={{ display: "none" }}>
              <div id="accountProcessPermissionsSection">
                <div className="account-process-col"><label className="acc-proc-label">Account</label><div className="account-grid" id="accountGrid">{accounts.map((a) => <div className="account-item-compact" key={a.id}><input type="checkbox" id={`account_${a.id}`} value={a.id} data-account-id={a.account_id} onChange={() => window.updateAccountSelection?.()} /><label htmlFor={`account_${a.id}`} className="account-label">{a.account_id}</label></div>)}</div><div className="account-control-buttons"><button type="button" className="btn-account-control" onClick={() => window.selectAllAccounts?.()}>Select All</button><button type="button" className="btn-clearall" onClick={() => window.clearAllAccounts?.()}>Clear All</button></div></div>
                <div className="account-process-col"><label className="acc-proc-label">Process</label><div className="account-grid" id="processGrid">{processes.map((p) => <div className="account-item-compact" key={p.id}><input type="checkbox" id={`process_${p.id}`} value={p.id} data-process-name={p.process_id} data-process-description={p.description || ""} onChange={() => window.updateProcessSelection?.()} /><label htmlFor={`process_${p.id}`} className="account-label">{p.process_id}{p.description ? <><br />{p.description}</> : null}</label></div>)}</div><div className="account-control-buttons"><button type="button" className="btn-account-control" onClick={() => window.selectAllProcesses?.()}>Select All</button><button type="button" className="btn-clearall" onClick={() => window.clearAllProcesses?.()}>Clear All</button></div></div>
              </div>
            </div>
          </div>
          <div className="edit-mode-bottom-bar" id="editModeBottomBar" style={{ display: "none" }}><button type="submit" form="userForm" className="btn btn-save">Save</button><button type="button" className="btn btn-cancel" onClick={() => window.closeModal?.()}>Cancel</button></div>
        </div>
      </div>
    </div>
  );
}
