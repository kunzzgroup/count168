import React, { useLayoutEffect, useRef } from "react";

/** Inline so first paint is 3-column even if extracted CSS applies one frame late */
const modalBodyStyle = {
  display: "flex",
  flexDirection: "column",
  flex: 1,
  minHeight: 0,
  overflow: "hidden",
  width: "100%",
};

const userModalCardStyle = {
  display: "flex",
  flexDirection: "row",
  flexWrap: "nowrap",
  alignItems: "stretch",
  flex: 1,
  minHeight: 0,
  minWidth: 0,
  overflow: "hidden",
  width: "100%",
};

const userModalColStyle = {
  flex: "1 1 0%",
  minWidth: 0,
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};
import {
  PERMISSION_KEYS,
  PERMISSION_ICONS,
  ALL_ROLE_OPTIONS,
  normRole,
  getAvailableRolesForCreation,
  getAvailableRolesForEdit,
  roleHasReadOnlyToggle,
  canInteractWithReadOnlyToggle,
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
  t,
}) {
  const cardRef = useRef(null);
  const modalBodyRef = useRef(null);

  useLayoutEffect(() => {
    if (!open) return;
    const forceReflow = () => {
      const nodes = [modalBodyRef.current, cardRef.current];
      nodes.forEach((el) => {
        if (el) void el.getBoundingClientRect();
      });
    };
    forceReflow();
    const a = requestAnimationFrame(() => {
      forceReflow();
      requestAnimationFrame(() => {
        forceReflow();
      });
    });
    return () => cancelAnimationFrame(a);
  }, [open]);

  if (!open) return null;

  const readOnlyToggleVisible = !editingRow?.is_owner_shadow && roleHasReadOnlyToggle(form.role);
  const readOnlyToggleCanInteract = canInteractWithReadOnlyToggle(currentUserRole, form.role);

  return (
    <div id="userModal" className="modal" style={{ display: "block" }}>
      <div className={`modal-content user-modal-content${isEditMode ? " edit-mode" : ""}`}>
        <div className="modal-header-bar">
          <h2 id="modalTitle">{isEditMode ? (editingRow?.is_owner_shadow ? t("editOwner") : t("editUser")) : t("addUser")}</h2>
          <button type="button" className="btn-back" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            {t("back")}
          </button>
        </div>
        <div ref={modalBodyRef} className="modal-body" style={modalBodyStyle}>
          <div ref={cardRef} className="user-modal-card" style={userModalCardStyle}>
            <div className="user-modal-col user-modal-col--info user-info-panel" style={userModalColStyle}>
              <h3 className="user-modal-col-title">{t("userInformation")}</h3>
              <form id="userForm" onSubmit={onSave}>
              <div className="user-info-grid">
                <div className="form-group user-info-field">
                  <label htmlFor="login_id">{t("loginId")} *</label>
                  <input
                    id="login_id"
                    required
                    disabled={loginDisabled}
                    value={form.login_id}
                    onChange={(e) => setForm((f) => ({ ...f, login_id: e.target.value.toUpperCase() }))}
                  />
                </div>
                {isC168Company ? (
                  <div className="form-group user-info-field password-row-container password-row-container--split">
                    <div className="password-field-wrapper">
                      <label htmlFor="password">{isEditMode ? t("password") : t("passwordRequiredMark")}</label>
                      <input id="password" type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
                    </div>
                    <div className="password-field-wrapper">
                      <label htmlFor="secondary_password">{t("secondaryPassword6Digits")}</label>
                      <input
                        id="secondary_password"
                        type="password"
                        maxLength={6}
                        pattern="[0-9]{6}"
                        placeholder={t("secondaryPasswordPlaceholder")}
                        value={form.secondary_password}
                        onChange={(e) => setForm((f) => ({ ...f, secondary_password: e.target.value.replace(/\D/g, "").slice(0, 6) }))}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="form-group user-info-field">
                    <label htmlFor="password">{isEditMode ? t("password") : t("passwordRequiredMark")}</label>
                    <input id="password" type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
                  </div>
                )}
                <div className="form-group user-info-field">
                  <label htmlFor="name">{t("nameRequired")}</label>
                  <input id="name" required disabled={fieldLocks.name} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value.toUpperCase() }))} />
                </div>
                <div className="form-group user-info-field">
                  <label htmlFor="role">{t("roleRequired")}</label>
                  <select id="role" required disabled={roleSelectDisabled || fieldLocks.role} value={form.role} onChange={(e) => {
                    const v = e.target.value;
                    setForm((f) => ({ ...f, role: v }));
                    applyPermTemplate(v, true);
                  }}>
                    <option value="">{t("selectRole")}</option>
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
                  <label htmlFor="email">{t("emailRequired")}</label>
                  <input
                    id="email"
                    type="text"
                    inputMode="email"
                    autoComplete="email"
                    spellCheck={false}
                    required
                    disabled={fieldLocks.email}
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value.toLowerCase() }))}
                  />
                </div>
                {(currentUserRole === "admin" || currentUserRole === "owner") && (
                  <div className="form-group user-info-field company-field-group">
                    <label>{t("companyRequired")}</label>
                    <div className="transaction-company-buttons user-modal-company-buttons">
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
                <h3 className="sidebar-permissions-title user-modal-permissions-title">
                  {t("permissions")}
                  {readOnlyToggleVisible ? (
                    <span
                      className="read-only-toggle-inline read-only-toggle-after-title"
                      style={{
                        opacity: readOnlyToggleCanInteract ? 1 : 0.6,
                      }}
                    >
                      <span className="read-only-label">{t("readOnly")}</span>
                      <label
                        className="toggle-switch"
                        style={{
                          cursor: readOnlyToggleCanInteract ? "pointer" : "not-allowed",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={form.read_only}
                          disabled={!readOnlyToggleCanInteract}
                          onChange={(e) => setForm((f) => ({ ...f, read_only: e.target.checked }))}
                        />
                        <span className="toggle-slider" />
                      </label>
                    </span>
                  ) : null}
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
                          {key === "home"
                            ? t("permHome")
                            : key === "admin"
                              ? t("permAdmin")
                              : key === "ownership"
                                ? t("permOwnership")
                                : key === "datacapture"
                                  ? t("dataCapture")
                                  : key === "payment"
                                    ? t("transactionPayment")
                                    : key === "report"
                                      ? t("permReport")
                                      : key === "maintenance"
                                        ? t("permMaintenance")
                                        : key === "account"
                                          ? t("account")
                                          : key === "process"
                                            ? t("process")
                                            : key.charAt(0).toUpperCase() + key.slice(1)}
                        </span>
                      </label>
                    </div>
                  ))}
                </div>
                <div className="permissions-actions user-modal-col-actions">
                  <button
                    type="button"
                    className="btn-secondary btn-select-all"
                    disabled={fieldLocks.sidebar || !!editingRow?.is_owner_shadow}
                    onClick={() => {
                      const n = new Set();
                      PERMISSION_KEYS.forEach(k => { if (!permDisabledMap[k]) n.add(k); });
                      setPermSelected(n);
                    }}
                  >{t("selectAll")}</button>
                  <button
                    type="button"
                    className="btn-clearall"
                    disabled={fieldLocks.sidebar || !!editingRow?.is_owner_shadow}
                    onClick={() => setPermSelected(new Set())}
                  >{t("clearAll")}</button>
                </div>
              </div>
              </form>
            </div>

            <div className="user-modal-col user-modal-col--account account-process-col" style={userModalColStyle}>
                <label className="acc-proc-label user-modal-col-title">{t("account")}</label>
                <div className="account-grid account-grid--four account-grid--process">
                  {modalAccounts.map((a) => (
                    <label key={a.id} className="account-item-compact account-item-compact--process user-modal-select-card">
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
                      <span className="account-label account-label--process">
                        {a.account_id}
                        {a.name ? <span className="account-label-desc">{a.name}</span> : null}
                      </span>
                    </label>
                  ))}
                </div>
                <div className="account-control-buttons user-modal-col-actions">
                  <button type="button" className="btn-account-control" disabled={!!editingRow?.is_owner_shadow} onClick={() => setSelectedAccountIds(new Set(modalAccounts.map(x => Number(x.id))))}>{t("selectAll")}</button>
                  <button type="button" className="btn-clearall" disabled={!!editingRow?.is_owner_shadow} onClick={() => setSelectedAccountIds(new Set())}>{t("clearAll")}</button>
                </div>
              </div>

            <div className="user-modal-col user-modal-col--process account-process-col" style={userModalColStyle}>
                <label className="acc-proc-label user-modal-col-title">{t("process")}</label>
                <div className="account-grid account-grid--four account-grid--process">
                  {modalProcesses.map((p) => (
                    <label key={p.id} className="account-item-compact account-item-compact--process user-modal-select-card">
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
                      <span className="account-label account-label--process">
                        {p.process_id}{p.description ? <span className="account-label-desc">{p.description}</span> : null}
                      </span>
                    </label>
                  ))}
                </div>
                <div className="account-control-buttons user-modal-col-actions">
                  <button type="button" className="btn-account-control" disabled={!!editingRow?.is_owner_shadow} onClick={() => setSelectedProcessIds(new Set(modalProcesses.map(x => Number(x.id))))}>{t("selectAll")}</button>
                  <button type="button" className="btn-clearall" disabled={!!editingRow?.is_owner_shadow} onClick={() => setSelectedProcessIds(new Set())}>{t("clearAll")}</button>
                </div>
              </div>
          </div>
        </div>
        <div className="user-modal-footer">
          <button type="submit" form="userForm" className="btn btn-save">{t("save")}</button>
          <button type="button" className="btn btn-cancel" onClick={onClose}>{t("cancel")}</button>
        </div>
      </div>
    </div>
  );
}
