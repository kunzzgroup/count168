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
            {/* 两列布局：Personal Information 和 Payment */}
            <div className="account-form-columns">
              {/* 左列：Personal Information */}
              <div className="account-form-column">
                <h3 className="account-section-header">Personal Information</h3>
                <div className="account-form-group">
                  <label>Account ID *</label>
                  <input
                    type="text"
                    value={form.account_id}
                    onChange={(e) => setForm(f => ({ ...f, account_id: toUpper(e.target.value) }))}
                    disabled={isEditMode}
                    required
                  />
                </div>
                <div className="account-form-group">
                  <label>Name *</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm(f => ({ ...f, name: toUpper(e.target.value) }))}
                    required
                  />
                </div>
                <div className="account-form-group">
                  <label>Role *</label>
                  <select
                    value={form.role}
                    onChange={(e) => setForm(f => ({ ...f, role: e.target.value }))}
                    required
                  >
                    <option value="">Select Role</option>
                    {orderedRoles.map(r => (
                      <option key={r} value={r}>
                        {toUpper(r) === "UPLINE" ? "SUPPLIER" : r}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="account-form-group">
                  <label>Password {isEditMode ? "*" : "*"}</label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm(f => ({ ...f, password: e.target.value }))}
                    required
                  />
                </div>
              </div>

              {/* 右列：Payment */}
              <div className="account-form-column">
                <h3 className="account-section-header">Payment</h3>
                <div className="account-form-group">
                  <label>Payment Alert</label>
                  <div className="account-radio-group">
                    <label className="account-radio-label">
                      <input
                        type="radio"
                        name="payment_alert"
                        value="1"
                        checked={form.payment_alert === "1"}
                        onChange={() => setForm(f => ({ ...f, payment_alert: "1" }))}
                      />
                      Yes
                    </label>
                    <label className="account-radio-label">
                      <input
                        type="radio"
                        name="payment_alert"
                        value="0"
                        checked={form.payment_alert === "0"}
                        onChange={() => setForm(f => ({ ...f, payment_alert: "0", alert_type: "", alert_start_date: "", alert_amount: "" }))}
                      />
                      No
                    </label>
                  </div>
                </div>

                {form.payment_alert === "1" && (
                  <div className="account-form-row">
                    <div className="account-form-group">
                      <label>Alert Type</label>
                      <select
                        value={form.alert_type}
                        onChange={(e) => setForm(f => ({ ...f, alert_type: e.target.value }))}
                      >
                        <option value="">Select Type</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                        {Array.from({ length: 31 }, (_, i) => (
                          <option key={i + 1} value={String(i + 1)}>
                            {i + 1} Days
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="account-form-group">
                      <label>Start Date</label>
                      <input
                        type="date"
                        value={form.alert_start_date}
                        onChange={(e) => setForm(f => ({ ...f, alert_start_date: e.target.value }))}
                      />
                    </div>
                  </div>
                )}

                <div className="account-form-group">
                  <label>Remark</label>
                  <textarea
                    rows="1"
                    value={form.remark}
                    onChange={(e) => setForm(f => ({ ...f, remark: toUpper(e.target.value) }))}
                    style={{ resize: "none", overflowY: "hidden", lineHeight: "1.5" }}
                  />
                </div>
              </div>
            </div>

            {/* Advanced Account Section */}
            <div className="account-form-section">
              <div className="account-advance-section">
                <h3>Advanced Account</h3>
                <div className="account-other-currency">
                  <label>Other Currency:</label>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <input
                      type="text"
                      placeholder="Enter new currency code (e.g., EUR, JPY, GBP)"
                      value={currencyInput}
                      onChange={(e) => setCurrencyInput(toUpper(e.target.value))}
                    />
                    <button
                      type="button"
                      className="account-btn-add-currency"
                      onClick={(e) => {
                        e.preventDefault();
                        onCreateCurrency();
                      }}
                    >
                      Create Currency
                    </button>
                  </div>
                  <div className="account-currency-list">
                    {currencies.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        className={`account-currency-item ${selectedCurrencyIds.includes(Number(c.id)) ? "selected" : ""}`}
                        onClick={() => {
                          const id = Number(c.id);
                          setSelectedCurrencyIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
                        }}
                      >
                        {c.code}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="account-other-currency" style={{ marginTop: "20px" }}>
                  <label>Company:</label>
                  <div className="account-currency-list">
                    {companies.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        className={`account-company-btn ${selectedCompanyIds.includes(Number(c.id)) ? "active" : ""}`}
                        onClick={() => {
                          const id = Number(c.id);
                          setSelectedCompanyIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
                        }}
                      >
                        {c.company_id}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="account-form-actions">
              <button type="submit" className="account-btn account-btn-save">
                {isEditMode ? "Update Account" : "Add Account"}
              </button>
              <button type="button" className="account-btn account-btn-cancel" onClick={onClose}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

