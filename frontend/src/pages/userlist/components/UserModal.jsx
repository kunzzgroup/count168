import React from "react";
import {
  PERMISSION_KEYS,
  PERMISSION_ICONS,
  ALL_ROLE_OPTIONS,
  normRole,
  getAvailableRolesForCreation,
  getAvailableRolesForEdit,
} from "../userListLogic.js";

export default function UserModal({
  open,
  onClose,
  isEditMode,
  editingRow,
  form,
  setForm,
  isC168Company,
  currentUserRole,
  roleSelectDisabled,
  loginDisabled,
  fieldLocks,
  permDisabledMap,
  permSelected,
  setPermSelected,
  modalCompanies,
  selectedCompanyIds,
  setSelectedCompanyIds,
  modalAccounts,
  selectedAccountIds,
  setSelectedAccountIds,
  modalProcesses,
  selectedProcessIds,
  setSelectedProcessIds,
  applyPermTemplate,
  onSave,
}) {
  if (!open) return null;

  return (
    <div id="userModal" className="modal" style={{ display: "block" }}>
      <div className="modal-content">
        <div className="modal-header-bar">
          <h2 id="modalTitle">{isEditMode ? (editingRow?.is_owner_shadow ? "Edit Owner" : "Edit User") : "Add User"}</h2>
          <button type="button" className="btn-back" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Back
          </button>
        </div>
        <div className="modal-body">
          <div className="user-info-panel">
            <h3>User Information</h3>
            <form id="userForm" onSubmit={onSave}>
              <div className="user-info-grid">
                <div className="form-group user-info-field">
                  <label htmlFor="login_id">Login ID *</label>
                  <input
                    id="login_id"
                    required
                    disabled={loginDisabled}
                    value={form.login_id}
                    onChange={(e) => setForm((f) => ({ ...f, login_id: e.target.value.toUpperCase() }))}
                  />
                </div>
                {isC168Company ? (
                  <div className="form-group user-info-field password-row-container" style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                    <div className="password-field-wrapper">
                      <label htmlFor="password">{isEditMode ? "Password" : "Password *"}</label>
                      <input id="password" type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
                    </div>
                    <div className="password-field-wrapper">
                      <label htmlFor="secondary_password">Secondary Password (6 digits)</label>
                      <input
                        id="secondary_password"
                        type="password"
                        maxLength={6}
                        pattern="[0-9]{6}"
                        placeholder="Enter 6-digit password"
                        value={form.secondary_password}
                        onChange={(e) => setForm((f) => ({ ...f, secondary_password: e.target.value.replace(/\D/g, "").slice(0, 6) }))}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="form-group user-info-field">
                    <label htmlFor="password">{isEditMode ? "Password" : "Password *"}</label>
                    <input id="password" type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
                  </div>
                )}
                <div className="form-group user-info-field">
                  <label htmlFor="name">Name *</label>
                  <input id="name" required disabled={fieldLocks.name} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value.toUpperCase() }))} />
                </div>
                <div className="form-group user-info-field">
                  <label htmlFor="role">Role *</label>
                  <select id="role" required disabled={roleSelectDisabled || fieldLocks.role} value={form.role} onChange={(e) => {
                    const v = e.target.value;
                    setForm((f) => ({ ...f, role: v }));
                    applyPermTemplate(v, true);
                  }}>
                    <option value="">Select Role</option>
                    {editingRow?.is_owner_shadow ? (
                      <option value="owner">Owner</option>
                    ) : (
                      <>
                        {(isEditMode ? getAvailableRolesForEdit(currentUserRole, editingRow?.role) : getAvailableRolesForCreation(currentUserRole)).map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                        {isEditMode && form.role && !getAvailableRolesForEdit(currentUserRole, editingRow?.role).find((x) => x.value === form.role) ? (
                          <option value={form.role}>{ALL_ROLE_OPTIONS.find((x) => x.value === form.role)?.label || String(form.role).toUpperCase()}</option>
                        ) : null}
                      </>
                    )}
                  </select>
                </div>
                <div className="form-group user-info-field">
                  <label htmlFor="email">Email *</label>
                  <input id="email" type="email" required disabled={fieldLocks.email} value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value.toLowerCase() }))} />
                </div>
                {(currentUserRole === "admin" || currentUserRole === "owner" || currentUserRole === "partnership") && (
                  <div className="form-group user-info-field company-field-group">
                    <label>Company *</label>
                    <div className="transaction-company-buttons" style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                      {modalCompanies.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className={`transaction-company-btn${selectedCompanyIds.includes(Number(c.id)) ? " active" : ""}`}
                          disabled={fieldLocks.company || !!editingRow?.is_owner_shadow}
                          onClick={() =>
                            setSelectedCompanyIds((prev) => {
                              const id = Number(c.id);
                              if (prev.includes(id)) return prev.filter((x) => x !== id);
                              return [...prev, id];
                            })
                          }
                        >
                          {c.company_id}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="sidebar-permissions-section">
                <h3 className="sidebar-permissions-title">
                  Permissions
                  {normRole(currentUserRole) === "owner" && (normRole(form.role) === "partnership" || normRole(editingRow?.role) === "partnership") && (
                    <span className="read-only-toggle-inline" style={{ marginLeft: 12 }}>
                      <span className="read-only-label">Read Only</span>
                      <label className="toggle-switch">
                        <input type="checkbox" checked={form.read_only} onChange={(e) => setForm((f) => ({ ...f, read_only: e.target.checked }))} />
                        <span className="toggle-slider" />
                      </label>
                    </span>
                  )}
                </h3>
                <div className="permissions-container">
                  {PERMISSION_KEYS.map((key) => (
                    <div key={key} className="permission-item" style={{ opacity: permDisabledMap[key] ? 0.6 : 1 }}>
                      <label className="permission-label">
                        <input
                          type="checkbox"
                          className="permission-checkbox"
                          disabled={fieldLocks.sidebar || permDisabledMap[key] || !!editingRow?.is_owner_shadow}
                          checked={permSelected.has(key)}
                          onChange={(e) => {
                            const on = e.target.checked;
                            setPermSelected((prev) => {
                              const n = new Set(prev);
                              if (on) n.add(key); else n.delete(key);
                              return n;
                            });
                          }}
                        />
                        <span className="permission-name">
                          <svg className="permission-icon" fill="currentColor" viewBox="0 0 24 24"><path d={PERMISSION_ICONS[key]} /></svg>
                          {key === "datacapture" ? "Data Capture" : key === "payment" ? "Transaction Payment" : key.charAt(0).toUpperCase() + key.slice(1)}
                        </span>
                      </label>
                    </div>
                  ))}
                </div>
                <div className="permissions-actions">
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={fieldLocks.sidebar || !!editingRow?.is_owner_shadow}
                    onClick={() => {
                      const n = new Set();
                      PERMISSION_KEYS.forEach(k => { if (!permDisabledMap[k]) n.add(k); });
                      setPermSelected(n);
                    }}
                  >Select All</button>
                  <button
                    type="button"
                    className="btn-clearall"
                    disabled={fieldLocks.sidebar || !!editingRow?.is_owner_shadow}
                    onClick={() => setPermSelected(new Set())}
                  >Clear All</button>
                </div>
              </div>
              {!isEditMode && (
                <div className="form-actions add-mode-actions">
                  <button type="submit" className="btn btn-save">Save</button>
                  <button type="button" className="btn btn-cancel" onClick={onClose}>Cancel</button>
                </div>
              )}
            </form>
          </div>

          <div className="permissions-panel" style={{ display: "flex", flex: 1 }}>
            <div style={{ display: "flex", width: "100%", gap: 0 }}>
              <div className="account-process-col" style={{ flex: 1, borderRight: "1px solid #e2e8f0", padding: "20px", display: "flex", flexDirection: "column" }}>
                <label className="acc-proc-label">Account</label>
                <div className="account-grid" style={{ flex: 1, overflowY: "auto", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px", alignContent: "start", padding: "10px 0" }}>
                  {modalAccounts.map((a) => (
                    <div key={a.id} className="account-item-compact" style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                      <input
                        type="checkbox"
                        id={`acc-${a.id}`}
                        checked={selectedAccountIds.has(Number(a.id))}
                        disabled={!!editingRow?.is_owner_shadow}
                        onChange={(e) => {
                          setSelectedAccountIds((prev) => {
                            const n = new Set(prev);
                            if (e.target.checked) n.add(Number(a.id)); else n.delete(Number(a.id));
                            return n;
                          });
                        }}
                      />
                      <label htmlFor={`acc-${a.id}`} className="account-label" style={{ fontSize: "12px", fontWeight: "600", cursor: "pointer", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.account_id}</label>
                    </div>
                  ))}
                </div>
                <div className="account-control-buttons" style={{ display: "flex", gap: "10px", justifyContent: "center", paddingTop: "15px", borderTop: "1px solid #e2e8f0", marginTop: "10px" }}>
                  <button type="button" className="btn-account-control" disabled={!!editingRow?.is_owner_shadow} onClick={() => setSelectedAccountIds(new Set(modalAccounts.map(x => Number(x.id))))}>Select All</button>
                  <button type="button" className="btn-clearall" disabled={!!editingRow?.is_owner_shadow} onClick={() => setSelectedAccountIds(new Set())}>Clear All</button>
                </div>
              </div>
              <div className="account-process-col" style={{ flex: 1, padding: "20px", display: "flex", flexDirection: "column" }}>
                <label className="acc-proc-label">Process</label>
                <div className="account-grid" style={{ flex: 1, overflowY: "auto", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px", alignContent: "start", padding: "10px 0" }}>
                  {modalProcesses.map((p) => (
                    <div key={p.id} className="account-item-compact" style={{ display: "flex", alignItems: "flex-start", gap: "5px" }}>
                      <input
                        type="checkbox"
                        id={`proc-${p.id}`}
                        checked={selectedProcessIds.has(Number(p.id))}
                        disabled={!!editingRow?.is_owner_shadow}
                        onChange={(e) => {
                          setSelectedProcessIds((prev) => {
                            const n = new Set(prev);
                            if (e.target.checked) n.add(Number(p.id)); else n.delete(Number(p.id));
                            return n;
                          });
                        }}
                      />
                      <label htmlFor={`proc-${p.id}`} className="account-label" style={{ fontSize: "12px", fontWeight: "600", cursor: "pointer", lineHeight: "1.2" }}>
                        {p.process_id}{p.description ? <span style={{ fontWeight: "normal", fontSize: "11px", color: "#666", display: "block" }}>{p.description}</span> : null}
                      </label>
                    </div>
                  ))}
                </div>
                <div className="account-control-buttons" style={{ display: "flex", gap: "10px", justifyContent: "center", paddingTop: "15px", borderTop: "1px solid #e2e8f0", marginTop: "10px" }}>
                  <button type="button" className="btn-account-control" disabled={!!editingRow?.is_owner_shadow} onClick={() => setSelectedProcessIds(new Set(modalProcesses.map(x => Number(x.id))))}>Select All</button>
                  <button type="button" className="btn-clearall" disabled={!!editingRow?.is_owner_shadow} onClick={() => setSelectedProcessIds(new Set())}>Clear All</button>
                </div>
              </div>
            </div>
          </div>
        </div>
        {isEditMode && (
          <div className="edit-mode-bottom-bar" style={{ display: "flex" }}>
            <button type="submit" form="userForm" className="btn btn-save">Save</button>
            <button type="button" className="btn btn-cancel" onClick={onClose}>Cancel</button>
          </div>
        )}
      </div>
    </div>
  );
}
