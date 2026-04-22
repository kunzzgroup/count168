import { useEffect, useMemo, useState } from "react";
import { assetUrl, buildApiUrl } from "../utils/apiUrl.js";

const PAGE_SIZE = 20;
const ROLE_HIERARCHY = {
  owner: 0,
  partnership: 1,
  admin: 2,
  manager: 3,
  supervisor: 4,
  accountant: 5,
  audit: 6,
  "customer service": 7,
};
const ALL_ROLES = [
  { value: "partnership", label: "Partnership" },
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "supervisor", label: "Supervisor" },
  { value: "accountant", label: "Accountant" },
  { value: "audit", label: "Audit" },
  { value: "customer service", label: "Customer Service" },
  { value: "company", label: "Company" },
];
const PERMISSIONS = ["home", "admin", "account", "process", "datacapture", "payment", "report", "maintenance"];

function up(v) {
  return String(v || "").toUpperCase();
}

export default function UserListPage() {
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
  const [me, setMe] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [users, setUsers] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [processes, setProcesses] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [sortColumn, setSortColumn] = useState("login");
  const [sortDirection, setSortDirection] = useState("asc");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedDeleteIds, setSelectedDeleteIds] = useState(new Set());
  const [toast, setToast] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [form, setForm] = useState({
    login_id: "",
    password: "",
    secondary_password: "",
    name: "",
    role: "",
    email: "",
    status: "active",
    read_only: 1,
  });
  const [formPermissions, setFormPermissions] = useState([]);
  const [formCompanyIds, setFormCompanyIds] = useState([]);
  const [formAccountPerms, setFormAccountPerms] = useState(new Set());
  const [formProcessPerms, setFormProcessPerms] = useState(new Set());

  const notify = (message, type = "success") => {
    setToast({ message, type });
    window.clearTimeout(window.__userListToastTimer);
    window.__userListToastTimer = window.setTimeout(() => setToast(null), 1800);
  };

  useEffect(() => {
    document.body.classList.remove("bg");
    document.body.classList.add("user-page");
    const cssA = document.createElement("link");
    cssA.rel = "stylesheet";
    cssA.href = assetUrl("css/userlist.css");
    document.head.appendChild(cssA);
    return () => {
      document.body.classList.remove("user-page");
      document.body.classList.add("bg");
      if (cssA.parentNode) cssA.parentNode.removeChild(cssA);
    };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [meRes, companiesRes] = await Promise.all([
          fetch(buildApiUrl("api/session/current_user_api.php"), { credentials: "include" }),
          fetch(buildApiUrl("api/transactions/get_owner_companies_api.php?all=1"), { credentials: "include" }),
        ]);
        const meJson = await meRes.json();
        const companiesJson = await companiesRes.json();
        if (!meRes.ok || !meJson.success || !meJson.data) return;
        const rows = Array.isArray(companiesJson?.data) ? companiesJson.data : [];
        const url = new URL(window.location.href);
        const companyFromQuery = url.searchParams.get("company_id");
        const effectiveCompany = companyFromQuery || meJson.data.company_id || rows[0]?.id || null;
        setMe(meJson.data);
        setCompanies(rows);
        setCompanyId(effectiveCompany ? Number(effectiveCompany) : null);
        setSearchTerm(url.searchParams.get("search") || "");
        setShowInactive(url.searchParams.get("showInactive") === "1");
        setShowAll(url.searchParams.get("showAll") === "1");
        const currentCompany = rows.find((r) => Number(r.id) === Number(effectiveCompany));
        setSelectedGroup(currentCompany?.group_id ? String(currentCompany.group_id).toUpperCase() : null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!companyId || loading) return;
    (async () => {
      const ok = await syncSessionCompany(companyId);
      if (ok) {
        await refreshAll();
      }
    })();
  }, [companyId, loading]);

  useEffect(() => {
    if (!companyId || loading) return;
    const t = window.setTimeout(() => loadUsers(), 200);
    return () => window.clearTimeout(t);
  }, [searchTerm, showInactive, showAll, companyId, loading]);

  const refreshAll = async () => {
    await Promise.all([loadUsers(), loadAccounts(), loadProcesses()]);
  };

  const syncSessionCompany = async (targetCompanyId) => {
    try {
      const res = await fetch(buildApiUrl(`api/session/update_company_session_api.php?company_id=${targetCompanyId}`), {
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        notify(json.message || json.error || "Failed to sync company session", "danger");
        return false;
      }
      return true;
    } catch {
      notify("Failed to sync company session", "danger");
      return false;
    }
  };

  const syncUrl = () => {
    const url = new URL(window.location.href);
    if (companyId) url.searchParams.set("company_id", String(companyId));
    else url.searchParams.delete("company_id");
    if (searchTerm.trim()) url.searchParams.set("search", searchTerm.trim());
    else url.searchParams.delete("search");
    if (showInactive) url.searchParams.set("showInactive", "1");
    else url.searchParams.delete("showInactive");
    if (showAll) url.searchParams.set("showAll", "1");
    else url.searchParams.delete("showAll");
    window.history.replaceState({}, document.title, url.toString());
  };

  const loadUsers = async () => {
    if (!companyId) return;
    setTableLoading(true);
    try {
      const url = new URL(buildApiUrl("api/users/userlist_api.php"));
      url.searchParams.set("_", String(Date.now()));
      const res = await fetch(url.toString(), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get" }),
      });
      const json = await res.json();
      const rows = Array.isArray(json?.data) ? json.data : [];
      if (!json?.success) {
        notify(json?.message || "Failed to load users", "danger");
      }
      setUsers(rows.map((u) => ({ ...u, is_owner_shadow: false })));
      setSelectedDeleteIds(new Set());
      setCurrentPage(1);
      syncUrl();
    } finally {
      setTableLoading(false);
    }
  };

  const loadAccounts = async () => {
    const url = new URL(buildApiUrl("api/accounts/accountlistapi.php"));
    url.searchParams.set("company_id", String(companyId));
    const res = await fetch(url.toString(), { credentials: "include" });
    const json = await res.json();
    const rows = Array.isArray(json?.data?.accounts) ? json.data.accounts : [];
    setAccounts(rows.filter((a) => String(a.status || "").toLowerCase() === "active"));
  };

  const loadProcesses = async () => {
    const url = new URL(buildApiUrl("api/processes/processlist_api.php"));
    url.searchParams.set("company_id", String(companyId));
    url.searchParams.set("showAll", "1");
    const res = await fetch(url.toString(), { credentials: "include" });
    const json = await res.json();
    const rows = Array.isArray(json?.data) ? json.data : [];
    setProcesses(rows.filter((p) => String(p.status || "").toLowerCase() === "active"));
  };

  const visibleUsers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const out = users.filter((u) => {
      const status = String(u.status || "").toLowerCase();
      if (!showAll) {
        if (showInactive && status !== "inactive") return false;
        if (!showInactive && status !== "active") return false;
      }
      if (!term) return true;
      return String(u.login_id || "").toLowerCase().includes(term) || String(u.name || "").toLowerCase().includes(term);
    });
    out.sort((a, b) => {
      if (sortColumn === "role") {
        const ao = ROLE_HIERARCHY[String(a.role || "").toLowerCase()] ?? 999;
        const bo = ROLE_HIERARCHY[String(b.role || "").toLowerCase()] ?? 999;
        if (ao !== bo) return sortDirection === "asc" ? ao - bo : bo - ao;
      }
      const ak = String(a.login_id || "").toLowerCase();
      const bk = String(b.login_id || "").toLowerCase();
      return sortDirection === "asc" ? ak.localeCompare(bk) : bk.localeCompare(ak);
    });
    return out;
  }, [users, searchTerm, showAll, showInactive, sortColumn, sortDirection]);

  const totalPages = useMemo(() => (showAll ? 1 : Math.max(1, Math.ceil(visibleUsers.length / PAGE_SIZE))), [visibleUsers.length, showAll]);
  const pageRows = useMemo(() => {
    if (showAll) return visibleUsers;
    const page = Math.min(currentPage, totalPages);
    const start = (page - 1) * PAGE_SIZE;
    return visibleUsers.slice(start, start + PAGE_SIZE);
  }, [visibleUsers, showAll, currentPage, totalPages]);

  const groupIds = useMemo(
    () => [...new Set(companies.filter((c) => c.group_id).map((c) => String(c.group_id).toUpperCase()))].sort(),
    [companies]
  );
  const companyButtons = useMemo(() => {
    const all = companies.filter((c) => c.company_id && String(c.company_id).trim() !== "");
    if (!selectedGroup) return all.filter((c) => !c.group_id || String(c.group_id).trim() === "");
    return all.filter((c) => String(c.group_id || "").toUpperCase() === selectedGroup);
  }, [companies, selectedGroup]);

  const canDeleteUser = (u) => {
    const meLevel = ROLE_HIERARCHY[String(me?.role || "").toLowerCase()] ?? 999;
    const targetLevel = ROLE_HIERARCHY[String(u.role || "").toLowerCase()] ?? 999;
    const isSelf = Number(me?.user_id) === Number(u.id);
    const status = String(u.status || "").toLowerCase();
    return !isSelf && status === "inactive" && targetLevel > meLevel;
  };

  const onSwitchCompany = async (c) => {
    if (!c?.id || Number(c.id) === Number(companyId)) return;
    const ok = await syncSessionCompany(c.id);
    if (!ok) return;
    setCompanyId(Number(c.id));
    setCurrentPage(1);
  };

  const openAdd = () => {
    setEditingUser(null);
    setForm({ login_id: "", password: "", secondary_password: "", name: "", role: "", email: "", status: "active", read_only: 1 });
    setFormPermissions([]);
    setFormCompanyIds(companyId ? [Number(companyId)] : []);
    setFormAccountPerms(new Set(accounts.map((a) => Number(a.id))));
    setFormProcessPerms(new Set(processes.map((p) => Number(p.id))));
    setModalOpen(true);
  };

  const openEdit = async (u) => {
    const res = await fetch(buildApiUrl("api/users/userlist_api.php"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "get", id: u.id }),
    });
    const json = await res.json();
    if (!json.success || !json.data) return notify(json.message || "Failed to load user", "danger");
    const d = json.data;
    const accountPerms = d.account_permissions ? JSON.parse(d.account_permissions) : null;
    const processPerms = d.process_permissions ? JSON.parse(d.process_permissions) : null;
    setEditingUser(u);
    setForm({
      login_id: d.login_id || "",
      password: "",
      secondary_password: "",
      name: d.name || "",
      role: d.role || "",
      email: d.email || "",
      status: d.status || "active",
      read_only: Number(d.read_only ?? 1),
    });
    setFormPermissions(Array.isArray(JSON.parse(d.permissions || "[]")) ? JSON.parse(d.permissions || "[]") : []);
    setFormCompanyIds(Array.isArray(d.company_ids) ? d.company_ids.map((x) => Number(x)) : []);
    setFormAccountPerms(
      accountPerms === null ? new Set(accounts.map((a) => Number(a.id))) : new Set((Array.isArray(accountPerms) ? accountPerms : []).map((x) => Number(x?.id ?? x)))
    );
    setFormProcessPerms(
      processPerms === null ? new Set(processes.map((p) => Number(p.id))) : new Set((Array.isArray(processPerms) ? processPerms : []).map((x) => Number(x?.id ?? x)))
    );
    setModalOpen(true);
  };

  const saveUser = async (e) => {
    e.preventDefault();
    const payload = {
      action: editingUser ? "update" : "create",
      id: editingUser?.id,
      login_id: up(form.login_id),
      name: up(form.name),
      email: String(form.email || "").toLowerCase(),
      role: form.role,
      status: form.status,
      permissions: formPermissions,
      account_permissions: Array.from(formAccountPerms).map((id) => ({ id })),
      process_permissions: Array.from(formProcessPerms).map((id) => ({ id })),
      company_ids: formCompanyIds,
      read_only: Number(form.read_only ? 1 : 0),
    };
    if (!editingUser || form.password) payload.password = form.password;
    if (form.secondary_password) payload.secondary_password = form.secondary_password;
    const res = await fetch(buildApiUrl("api/users/userlist_api.php"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!json.success) return notify(json.message || "Save failed", "danger");
    setModalOpen(false);
    notify(editingUser ? "User updated successfully" : "User created successfully", "success");
    await loadUsers();
  };

  const onDeleteSelected = async () => {
    setConfirmOpen(false);
    const ids = Array.from(selectedDeleteIds);
    for (const id of ids) {
      const res = await fetch(buildApiUrl("api/users/userlist_api.php"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      });
      const json = await res.json();
      if (!json.success) return notify(json.message || `Delete failed for ${id}`, "danger");
    }
    notify("Users deleted", "success");
    setSelectedDeleteIds(new Set());
    await loadUsers();
  };

  const toggleStatus = async (u) => {
    const fd = new FormData();
    fd.append("id", u.id);
    const res = await fetch(buildApiUrl("api/users/toggle_status_api.php"), { method: "POST", credentials: "include", body: fd });
    const json = await res.json();
    if (!json.success) return notify(json.message || json.error || "Toggle failed", "danger");
    setUsers((prev) => prev.map((x) => (Number(x.id) === Number(u.id) ? { ...x, status: json.newStatus || json?.data?.newStatus } : x)));
  };

  if (loading) return null;

  return (
    <>
      <div className="container">
        <div className="content">
          <h1>User List</h1>
          <div className="separator-line" />
          <div className="action-buttons-container" style={{ marginBottom: 20 }}>
            <div className="action-buttons" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button className="btn btn-add" onClick={openAdd}>Add User</button>
                <div className="search-container"><input type="text" value={searchTerm} onChange={(e) => setSearchTerm(up(e.target.value).replace(/[^A-Z0-9]/g, ""))} placeholder="Search by Login Id or Name" className="search-input" /></div>
                <div className="checkbox-section"><input type="checkbox" checked={showInactive} onChange={(e) => { setShowInactive(e.target.checked); if (e.target.checked) setShowAll(false); }} /><label>Show Inactive</label></div>
                <div className="checkbox-section"><input type="checkbox" checked={showAll} onChange={(e) => { setShowAll(e.target.checked); if (e.target.checked) setShowInactive(false); }} /><label>Show All</label></div>
              </div>
              <button className="btn btn-delete" disabled={!selectedDeleteIds.size} onClick={() => setConfirmOpen(true)}>{selectedDeleteIds.size ? `Delete (${selectedDeleteIds.size})` : "Delete"}</button>
            </div>
            {groupIds.length > 0 && <div className="transaction-company-filter" style={{ display: "flex", marginTop: 10 }}><span className="transaction-company-label">GroupID:</span><div className="transaction-company-buttons">{groupIds.map((gid) => <button key={gid} type="button" className={`transaction-company-btn ${selectedGroup === gid ? "active" : ""}`} onClick={() => setSelectedGroup((p) => (p === gid ? null : gid))}>{gid}</button>)}</div></div>}
            <div className="transaction-company-filter" style={{ display: "flex" }}><span className="transaction-company-label">Company:</span><div className="transaction-company-buttons">{companyButtons.map((c) => <button key={c.id} type="button" className={`transaction-company-btn ${Number(c.id) === Number(companyId) ? "active" : ""}`} onClick={() => onSwitchCompany(c)}>{c.company_id}</button>)}</div></div>
          </div>
          <div className="user-table-wrapper">
            <div className="table-header">
              <div className="header-item">No</div>
              <div className="header-item header-sortable" onClick={() => { setSortColumn("login"); setSortDirection((d) => (sortColumn === "login" && d === "asc" ? "desc" : "asc")); }}>Login Id</div>
              <div className="header-item">Name</div><div className="header-item">Email</div>
              <div className="header-item header-sortable" onClick={() => { setSortColumn("role"); setSortDirection((d) => (sortColumn === "role" && d === "asc" ? "desc" : "asc")); }}>Role</div>
              <div className="header-item">Status</div><div className="header-item">Last Login</div><div className="header-item">Created By</div><div className="header-item">Action</div>
            </div>
            <div className="user-cards">{tableLoading ? <div className="user-card"><div className="card-item">Loading...</div></div> : pageRows.map((u, idx) => (
              <div className={`user-card ${idx % 2 === 0 ? "row-even" : "row-odd"}`} key={u.id}>
                <div className="card-item">{showAll ? idx + 1 : (currentPage - 1) * PAGE_SIZE + idx + 1}</div>
                <div className="card-item">{u.login_id}</div><div className="card-item">{u.name}</div><div className="card-item">{u.email || "-"}</div>
                <div className="card-item uppercase-text"><span className={`role-badge role-${String(u.role || "").replace(/\s+/g, "-")}`}>{up(u.role)}</span></div>
                <div className="card-item uppercase-text"><span className={`role-badge ${String(u.status).toLowerCase() === "active" ? "status-active" : "status-inactive"} status-clickable`} onClick={() => toggleStatus(u)}>{up(u.status)}</span></div>
                <div className="card-item">{u.last_login ? String(u.last_login).slice(0, 16).replace("T", " ") : "-"}</div>
                <div className="card-item uppercase-text">{up(u.created_by || "-")}</div>
                <div className="card-item"><button className="btn btn-edit edit-btn" onClick={() => openEdit(u)}><img src="/images/edit.svg" alt="Edit" /></button>{canDeleteUser(u) && <input type="checkbox" className="user-checkbox" checked={selectedDeleteIds.has(Number(u.id))} onChange={(e) => setSelectedDeleteIds((prev) => { const next = new Set(prev); if (e.target.checked) next.add(Number(u.id)); else next.delete(Number(u.id)); return next; })} />}</div>
              </div>
            ))}</div>
          </div>
          {!showAll && <div className="pagination-container"><button className="pagination-btn" disabled={currentPage <= 1} onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}>◀</button><span className="pagination-info">{Math.min(currentPage, totalPages)} of {totalPages}</span><button className="pagination-btn" disabled={currentPage >= totalPages} onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}>▶</button></div>}
        </div>
      </div>

      {modalOpen && (
        <div className="modal" style={{ display: "block" }}>
          <div className="modal-content">
            <div className="modal-header-bar"><h2>{editingUser ? "Edit User" : "Add User"}</h2><button type="button" className="btn-back" onClick={() => setModalOpen(false)}>Back</button></div>
            <form id="userForm" onSubmit={saveUser} className="modal-body">
              <div className="user-info-panel">
                <div className="user-info-grid">
                  <div className="form-group user-info-field"><label>Login ID *</label><input required disabled={!!editingUser} value={form.login_id} onChange={(e) => setForm((f) => ({ ...f, login_id: up(e.target.value) }))} /></div>
                  <div className="form-group user-info-field"><label>Password {editingUser ? "" : "*"}</label><input type="password" required={!editingUser} value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} /></div>
                  {String(companies.find((c) => Number(c.id) === Number(companyId))?.company_id || "").toUpperCase() === "C168" && (
                    <div className="form-group user-info-field"><label>Secondary Password</label><input type="password" maxLength={6} value={form.secondary_password} onChange={(e) => setForm((f) => ({ ...f, secondary_password: e.target.value.replace(/[^0-9]/g, "").slice(0, 6) }))} /></div>
                  )}
                  <div className="form-group user-info-field"><label>Name *</label><input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: up(e.target.value) }))} /></div>
                  <div className="form-group user-info-field"><label>Role *</label><select required value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}><option value="">Select Role</option>{ALL_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select></div>
                  <div className="form-group user-info-field"><label>Email *</label><input type="email" required value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: String(e.target.value || "").toLowerCase() }))} /></div>
                </div>
                {(String(me?.role || "").toLowerCase() === "admin" || String(me?.role || "").toLowerCase() === "owner") && (
                  <div className="form-group user-info-field company-field-group"><label>Company *</label><div className="transaction-company-buttons">{companies.filter((c) => c.company_id).map((c) => <button key={c.id} type="button" className={`transaction-company-btn ${formCompanyIds.includes(Number(c.id)) ? "active" : ""}`} onClick={() => setFormCompanyIds((prev) => prev.includes(Number(c.id)) ? prev.filter((x) => Number(x) !== Number(c.id)) : [...prev, Number(c.id)])}>{c.company_id}</button>)}</div></div>
                )}
                <div className="sidebar-permissions-section"><h3 className="sidebar-permissions-title">Permissions</h3><div className="permissions-container">{PERMISSIONS.map((p) => <div key={p} className="permission-item"><label className="permission-label"><input type="checkbox" className="permission-checkbox" checked={formPermissions.includes(p)} onChange={(e) => setFormPermissions((prev) => e.target.checked ? [...new Set([...prev, p])] : prev.filter((x) => x !== p))} /><span className="permission-name">{p}</span></label></div>)}</div></div>
              </div>
              <div className="permissions-panel" id="editModeRightPanel" style={{ display: "flex" }}>
                <div id="accountProcessPermissionsSection" style={{ display: "flex" }}>
                  <div className="account-process-col"><label className="acc-proc-label">Account</label><div className="account-grid">{accounts.map((a) => <div key={a.id} className="account-item-compact"><input type="checkbox" checked={formAccountPerms.has(Number(a.id))} onChange={(e) => setFormAccountPerms((prev) => { const next = new Set(prev); if (e.target.checked) next.add(Number(a.id)); else next.delete(Number(a.id)); return next; })} /><label className="account-label">{a.account_id}</label></div>)}</div></div>
                  <div className="account-process-col"><label className="acc-proc-label">Process</label><div className="account-grid">{processes.map((p) => <div key={p.id} className="account-item-compact"><input type="checkbox" checked={formProcessPerms.has(Number(p.id))} onChange={(e) => setFormProcessPerms((prev) => { const next = new Set(prev); if (e.target.checked) next.add(Number(p.id)); else next.delete(Number(p.id)); return next; })} /><label className="account-label">{p.process_name}{p.description ? ` (${p.description})` : ""}</label></div>)}</div></div>
                </div>
              </div>
              <div className="edit-mode-bottom-bar" style={{ display: "flex" }}><button type="submit" className="btn btn-save">Save</button><button type="button" className="btn btn-cancel" onClick={() => setModalOpen(false)}>Cancel</button></div>
            </form>
          </div>
        </div>
      )}

      {confirmOpen && <div className="modal" style={{ display: "flex" }}><div className="confirm-modal-content"><h2 className="confirm-title">Confirm Delete</h2><p className="confirm-message">Are you sure you want to delete {selectedDeleteIds.size} user(s)?</p><div className="confirm-actions"><button type="button" className="btn btn-cancel" onClick={() => setConfirmOpen(false)}>Cancel</button><button type="button" className="btn btn-delete" onClick={onDeleteSelected}>Delete</button></div></div></div>}
      {toast && <div className="notification-container"><div className={`notification notification-${toast.type} show`}>{toast.message}</div></div>}
    </>
  );
}
