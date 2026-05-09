import React from "react";

function upper(v) {
  return String(v || "").toUpperCase();
}

/** HTML input `size`: approx placeholder span (devtools-style); CJK needs extra cols */
function inputColsFromPlaceholder(ph) {
  const s = String(ph || "");
  if (!s.trim()) return 16;
  const hasCjk = /[\u4e00-\u9fff\u3000-\u303f\u3040-\u30ff]/.test(s);
  return Math.min(85, Math.max(12, Math.ceil([...s].length * (hasCjk ? 1.15 : 1) + 2)));
}

/**
 * Single shared Account modal (Add/Edit) UI component.
 *
 * Design goals:
 * - Keep **one** modal implementation to avoid drift/overrides.
 * - No network calls inside. All state & side effects are injected via props.
 */
export default function AccountModal({
  open,
  title,
  isEditMode,
  form,
  setForm,
  orderedRoles,
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
  onSubmit,
  onClose,
  t,
}) {
  if (!open) return null;

  const text = (key, params) => (typeof t === "function" ? t(key, params) : key);
  const modalId = isEditMode ? "account-editModal" : "account-addModal";
  const currencyPlaceholder = text("newCurrencyPlaceholder");
  const currencyInputCols = inputColsFromPlaceholder(currencyPlaceholder);
  const alertAmountPlaceholder = text("enterAmountPlaceholder");
  const alertAmountInputCols = inputColsFromPlaceholder(alertAmountPlaceholder);

  const companyButtons = Array.isArray(companies)
    ? companies.filter((c) => c?.company_id && String(c.company_id).trim() !== "")
    : [];

  const toggleId = (arr, id) => (arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);

  const renderCurrencyList = () => {
    if (!Array.isArray(currencies) || currencies.length === 0) return null;

    // If no remove handler: render as simple selectable pills.
    if (typeof onRemoveCurrency !== "function") {
      return (
        <div className="account-currency-list">
          {currencies.map((c) => {
            const id = Number(c.id);
            const selected = selectedCurrencyIds.includes(id);
            return (
              <button
                key={c.id}
                type="button"
                className={`account-currency-item ${selected ? "selected" : ""}`}
                onClick={() => setSelectedCurrencyIds((prev) => toggleId(prev, id))}
              >
                {upper(c.code)}
              </button>
            );
          })}
        </div>
      );
    }

    // With remove handler: render delete button (used in bank process page).
    return (
      <div className="account-currency-list">
        {currencies.map((c) => {
          const id = Number(c.id);
          const selected = selectedCurrencyIds.includes(id);
          return (
            <div key={c.id} className={`account-currency-item currency-toggle-item ${selected ? "selected" : ""}`}>
              <span className="currency-code-text" onClick={() => setSelectedCurrencyIds((prev) => toggleId(prev, id))} role="presentation">
                {upper(c.code)}
              </span>
              <button type="button" className="currency-delete-btn" onClick={() => onRemoveCurrency(c.id)}>
                ×
              </button>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div id={modalId} className="account-modal" style={{ display: "block" }}>
      <div className="account-modal-content">
        <div className="account-modal-header">
          <h2>{title}</h2>
          <span className="account-close" onClick={onClose} role="presentation">
            &times;
          </span>
        </div>
        <div className="account-modal-body">
          <form className="account-form" onSubmit={onSubmit}>
            <div className="account-form-columns">
              <div className="account-form-column">
                <h3 className="account-section-header">{text("personalInformation")}</h3>
                <div className="account-form-group">
                  <label>{text("accountIdRequired")}</label>
                  <input
                    type="text"
                    value={form.account_id}
                    onChange={(e) => setForm((f) => ({ ...f, account_id: upper(e.target.value) }))}
                    disabled={!!isEditMode}
                    required
                  />
                </div>
                <div className="account-form-group">
                  <label>{text("nameRequired")}</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: upper(e.target.value) }))}
                    required
                  />
                </div>
                <div className="account-form-group">
                  <label>{text("roleRequired")}</label>
                  <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} required>
                    <option value="">{text("selectRole")}</option>
                    {(orderedRoles || []).map((r) => (
                      <option key={r} value={r}>
                        {upper(r) === "UPLINE" ? text("supplier") : r}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="account-form-group">
                  <label>{text("passwordRequired")}</label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                    required
                  />
                </div>
              </div>

              <div className="account-form-column">
                <h3 className="account-section-header">{text("payment")}</h3>
                <div className="account-form-group">
                  <label>{text("paymentAlert")}</label>
                  <div className="account-radio-group">
                    <label className="account-radio-label">
                      <input
                        type="radio"
                        name="payment_alert"
                        value="1"
                        checked={form.payment_alert === "1"}
                        onChange={() => setForm((f) => ({ ...f, payment_alert: "1" }))}
                      />
                      {text("yes")}
                    </label>
                    <label className="account-radio-label">
                      <input
                        type="radio"
                        name="payment_alert"
                        value="0"
                        checked={form.payment_alert === "0"}
                        onChange={() =>
                          setForm((f) => ({ ...f, payment_alert: "0", alert_type: "", alert_start_date: "", alert_amount: "" }))
                        }
                      />
                      {text("noWord")}
                    </label>
                  </div>
                </div>

                {form.payment_alert === "1" && (
                  <div className="account-form-row">
                    <div className="account-form-group">
                      <label>{text("alertType")}</label>
                      <select value={form.alert_type} onChange={(e) => setForm((f) => ({ ...f, alert_type: e.target.value }))}>
                        <option value="">{text("selectType")}</option>
                        <option value="weekly">{text("weekly")}</option>
                        <option value="monthly">{text("monthly")}</option>
                        {Array.from({ length: 31 }, (_, i) => (
                          <option key={i + 1} value={String(i + 1)}>
                            {text("days", { n: i + 1 })}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="account-form-group">
                      <label>{text("startDate")}</label>
                      <input
                        type="date"
                        value={form.alert_start_date}
                        onChange={(e) => setForm((f) => ({ ...f, alert_start_date: e.target.value }))}
                      />
                    </div>
                  </div>
                )}

                {form.payment_alert === "1" && (
                  <div className="account-form-group account-form-group--placeholder-width">
                    <label>{text("alertAmount")}</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      size={alertAmountInputCols}
                      placeholder={alertAmountPlaceholder}
                      value={form.alert_amount || ""}
                      onChange={(e) => setForm((f) => ({ ...f, alert_amount: e.target.value }))}
                    />
                  </div>
                )}

                <div className="account-form-group">
                  <label>{text("remark")}</label>
                  <textarea
                    rows="1"
                    value={form.remark}
                    onChange={(e) => setForm((f) => ({ ...f, remark: upper(e.target.value) }))}
                    style={{ resize: "none", overflowY: "hidden", lineHeight: "1.5" }}
                  />
                </div>
              </div>
            </div>

            <div className="account-form-section">
              <div className="account-advance-section">
                <h3>{text("advancedAccount")}</h3>
                <div className="account-other-currency">
                  <label>{text("otherCurrency")}</label>
                  <div className="account-currency-input-group">
                    <input
                      type="text"
                      size={currencyInputCols}
                      placeholder={currencyPlaceholder}
                      value={currencyInput}
                      onChange={(e) => setCurrencyInput(upper(e.target.value))}
                    />
                    <button type="button" className="account-btn-add-currency" onClick={onCreateCurrency}>
                      {text("createCurrency")}
                    </button>
                  </div>
                  {renderCurrencyList()}
                </div>

                <div className="account-other-currency account-other-currency--company">
                  <label>{text("company")}</label>
                  <div className="account-currency-list">
                    {companyButtons.map((c) => {
                      const id = Number(c.id);
                      const active = selectedCompanyIds.includes(id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          className={`account-company-btn ${active ? "active" : ""}`}
                          onClick={() => setSelectedCompanyIds((prev) => toggleId(prev, id))}
                        >
                          {upper(c.company_id)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className="account-form-actions">
              <button type="submit" className="account-btn account-btn-save">
                {isEditMode ? text("updateAccount") : text("addAccount")}
              </button>
              <button type="button" className="account-btn account-btn-cancel" onClick={onClose}>
                {text("cancel")}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

