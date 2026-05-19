const ALERT_DAY_OPTIONS = Array.from({ length: 31 }, (_, i) => i + 1);

/**
 * React-owned Add Account modal shell — form fields match legacy DOM ids
 * so initAddAccountModalAfterMount / bindSummaryAddAccountFormSubmitOnce work unchanged.
 */
export default function AddAccountModal({ open, onClose }) {
  if (!open) return null;

  return (
    <div id="addModal" className="account-modal" style={{ display: "block" }} role="dialog" aria-modal="true">
      <div className="account-modal-content">
        <div className="account-modal-header">
          <h2>Add Account</h2>
          <span className="account-close" role="presentation" onClick={onClose}>
            &times;
          </span>
        </div>
        <div className="account-modal-body">
          <form id="addAccountForm" className="account-form">
            <div className="account-form-columns">
              <div className="account-form-column">
                <h3 className="account-section-header">Personal Information</h3>
                <div className="account-form-group">
                  <label htmlFor="add_account_id">Account ID *</label>
                  <input type="text" id="add_account_id" name="account_id" required />
                </div>
                <div className="account-form-group">
                  <label htmlFor="add_name">Name *</label>
                  <input type="text" id="add_name" name="name" required />
                </div>
                <div className="account-form-group">
                  <label htmlFor="add_role">Role *</label>
                  <select id="add_role" name="role" required defaultValue="">
                    <option value="">Select Role</option>
                  </select>
                </div>
                <div className="account-form-group">
                  <label htmlFor="add_password">Password *</label>
                  <input type="password" id="add_password" name="password" required autoComplete="new-password" />
                </div>
              </div>

              <div className="account-form-column">
                <h3 className="account-section-header">Payment</h3>
                <div className="account-form-group" />
                <div className="account-form-group">
                  <label>Payment Alert</label>
                  <div className="account-radio-group">
                    <label className="account-radio-label">
                      <input type="radio" name="add_payment_alert" value="1" />
                      Yes
                    </label>
                    <label className="account-radio-label">
                      <input type="radio" name="add_payment_alert" value="0" defaultChecked />
                      No
                    </label>
                  </div>
                </div>
                <div className="account-form-row" id="add_alert_fields" style={{ display: "none" }}>
                  <div className="account-form-group">
                    <label htmlFor="add_alert_type">Alert Type</label>
                    <select id="add_alert_type" name="alert_type" defaultValue="">
                      <option value="">Select Type</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                      {ALERT_DAY_OPTIONS.map((d) => (
                        <option key={d} value={String(d)}>
                          {d} Days
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="account-form-group">
                    <label htmlFor="add_alert_start_date">Start Date</label>
                    <input type="date" id="add_alert_start_date" name="alert_start_date" />
                  </div>
                </div>
                <div className="account-form-group" id="add_alert_amount_row" style={{ display: "none" }}>
                  <label htmlFor="add_alert_amount">Alert (Amount)</label>
                  <input
                    type="number"
                    id="add_alert_amount"
                    name="alert_amount"
                    step="0.01"
                    placeholder="Enter amount (auto-converted to negative)"
                  />
                </div>
                <div className="account-form-group">
                  <label htmlFor="add_remark">Remark</label>
                  <textarea id="add_remark" name="remark" rows={1} style={{ resize: "none", overflowY: "hidden", lineHeight: 1.5 }} />
                </div>
              </div>
            </div>

            <div className="account-form-section">
              <div className="account-advance-section">
                <h3>Advanced Account</h3>

                <div className="account-other-currency">
                  <label>Other Currency:</label>
                  <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                    <input
                      type="text"
                      id="addCurrencyInput"
                      placeholder="Enter new currency code (e.g., EUR, JPY, GBP)"
                      style={{ flex: 1, padding: 8, border: "1px solid #ddd", borderRadius: 4 }}
                    />
                    <button type="button" className="account-btn-add-currency" onClick={() => window.addCurrencyFromInput?.("add")}>
                      Create Currency
                    </button>
                  </div>
                  <div className="account-currency-list" id="addCurrencyList" />
                </div>

                <div className="account-other-currency" style={{ marginTop: 20 }}>
                  <label>Company:</label>
                  <div className="account-currency-list" id="addCompanyList" />
                </div>
              </div>
            </div>

            <div className="account-form-actions">
              <button type="submit" className="account-btn account-btn-save">
                Add Account
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
