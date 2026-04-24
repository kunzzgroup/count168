import React from "react";
import { toUpper, getOrderedRoles } from "../accountLogic.js";

export default function AccountFormModal({
  open,
  isEditMode,
  form,
  setForm,
  roles,
  currencies,
  companies,
  selectedCurrencyIds,
  setSelectedCurrencyIds,
  selectedCompanyIds,
  setSelectedCompanyIds,
  currencyInput,
  setCurrencyInput,
  onCreateCurrency,
  onRemoveCurrency,
  onSave,
  onClose
}) {
  if (!open) return null;

  const orderedRoles = getOrderedRoles(roles);

  return (
    <div className="account-modal" style={{ display: "block" }}>
      <div className="account-modal-content">
        <div className="account-modal-header">
          <h2>{isEditMode ? "Edit Account" : "Add Account"}</h2>
          <span className="account-close" onClick={onClose}>&times;</span>
        </div>
        <div className="account-modal-body">
          <form className="account-form" onSubmit={onSave}>
            <div className="account-form-columns">
              <div className="account-form-column">
                <h3 className="account-section-header">Personal Information</h3>
                <div className="account-form-group">
                  <label>Account ID *</label>
                  <input value={form.account_id} onChange={(e) => setForm(f => ({ ...f, account_id: toUpper(e.target.value) }))} disabled={isEditMode} required />
                </div>
                <div className="account-form-group">
                  <label>Name *</label>
                  <input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: toUpper(e.target.value) }))} required />
                </div>
                <div className="account-form-group">
                  <label>Role *</label>
                  <select value={form.role} onChange={(e) => setForm(f => ({ ...f, role: e.target.value }))} required>
                    <option value="">Select Role</option>
                    {orderedRoles.map(r => <option key={r} value={r}>{toUpper(r) === "UPLINE" ? "SUPPLIER" : r}</option>)}
                  </select>
                </div>
                <div className="account-form-group">
                  <label>Password {isEditMode ? "" : "*"}</label>
                  <input type="password" value={form.password} onChange={(e) => setForm(f => ({ ...f, password: e.target.value }))} required={!isEditMode} />
                </div>
              </div>

              <div className="account-form-column">
                <h3 className="account-section-header">Payment</h3>
                <div className="account-form-group">
                  <label>Payment Alert</label>
                  <div className="account-radio-group">
                    <label className="account-radio-label"><input type="radio" checked={form.payment_alert === "1"} onChange={() => setForm(f => ({ ...f, payment_alert: "1" }))} />Yes</label>
                    <label className="account-radio-label"><input type="radio" checked={form.payment_alert === "0"} onChange={() => setForm(f => ({ ...f, payment_alert: "0", alert_type: "", alert_start_date: "", alert_amount: "" }))} />No</label>
                  </div>
                </div>
                {form.payment_alert === "1" && (
                  <>
                    <div className="account-form-row" style={{ display: "flex", gap: "10px" }}>
                      <div className="account-form-group" style={{ flex: 1 }}>
                        <label>Alert Type</label>
                        <select value={form.alert_type} onChange={(e) => setForm(f => ({ ...f, alert_type: e.target.value }))}>
                          <option value="">Select Type</option>
                          <option value="weekly">Weekly</option>
                          <option value="monthly">Monthly</option>
                          {Array.from({ length: 31 }, (_, i) => <option key={i + 1} value={String(i + 1)}>{i + 1} Days</option>)}
                        </select>
                      </div>
                      <div className="account-form-group" style={{ flex: 1 }}>
                        <label>Start Date</label>
                        <input type="date" value={form.alert_start_date} onChange={(e) => setForm(f => ({ ...f, alert_start_date: e.target.value }))} />
                      </div>
                    </div>
                    <div className="account-form-group">
                      <label>Alert (Amount)</label>
                      <input type="number" step="0.01" value={form.alert_amount} onChange={(e) => setForm(f => ({ ...f, alert_amount: e.target.value }))} />
                    </div>
                  </>
                )}
                <div className="account-form-group">
                  <label>Remark</label>
                  <textarea rows={1} style={{ resize: "none" }} value={form.remark} onChange={(e) => setForm(f => ({ ...f, remark: toUpper(e.target.value) }))} />
                </div>
              </div>
            </div>

            <div className="account-form-footer-sections" style={{ display: "flex", gap: "20px", marginTop: "15px" }}>
              <div className="account-selection-panel" style={{ flex: 1 }}>
                <h3 className="account-section-header">Currency</h3>
                <div className="account-currency-create-box" style={{ marginBottom: "10px", display: "flex", gap: "5px" }}>
                  <input placeholder="New Code" value={currencyInput} onChange={(e) => setCurrencyInput(e.target.value)} style={{ flex: 1 }} />
                  <button type="button" className="account-btn-small" onClick={onCreateCurrency}>Add</button>
                </div>
                <div className="account-selection-grid" style={{ maxHeight: "150px", overflowY: "auto", border: "1px solid #eee", padding: "10px" }}>
                  {currencies.map(c => (
                    <div key={c.id} className="account-selection-item" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "5px" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={selectedCurrencyIds.includes(Number(c.id))}
                          onChange={(e) => {
                            const id = Number(c.id);
                            setSelectedCurrencyIds(prev => e.target.checked ? [...prev, id] : prev.filter(x => x !== id));
                          }}
                        />
                        {c.code}
                      </label>
                      <span style={{ color: "#ff4d4f", cursor: "pointer", fontSize: "18px" }} onClick={() => onRemoveCurrency(c.id)}>&times;</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="account-selection-panel" style={{ flex: 1 }}>
                <h3 className="account-section-header">Company</h3>
                <div className="account-selection-grid" style={{ maxHeight: "190px", overflowY: "auto", border: "1px solid #eee", padding: "10px" }}>
                  {companies.map(c => (
                    <div key={c.id} className="account-selection-item" style={{ marginBottom: "5px" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={selectedCompanyIds.includes(Number(c.id))}
                          onChange={(e) => {
                            const id = Number(c.id);
                            setSelectedCompanyIds(prev => e.target.checked ? [...prev, id] : prev.filter(x => x !== id));
                          }}
                        />
                        {c.company_id}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="account-modal-footer" style={{ marginTop: "20px", textAlign: "right" }}>
              <button type="submit" className="account-btn account-btn-save">Save</button>
              <button type="button" className="account-btn account-btn-cancel" onClick={onClose} style={{ marginLeft: "10px" }}>Cancel</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
