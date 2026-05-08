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
  onClose,
  t,
}) {
  if (!open) return null;

  const orderedRoles = getOrderedRoles(roles);

  return (
    <div className="account-modal" style={{ display: "block" }}>
      <div className="account-modal-content">
        <div className="account-modal-header">
          <h2>{isEditMode ? t("editAccount") : t("addAccount")}</h2>
          <span className="account-close" onClick={onClose}>&times;</span>
        </div>
        <div className="account-modal-body">
          <form className="account-form" onSubmit={onSave}>
            {/* 两列布局：Personal Information 和 Payment */}
            <div className="account-form-columns">
              {/* 左列：Personal Information */}
              <div className="account-form-column">
                <h3 className="account-section-header">{t("personalInformation")}</h3>
                <div className="account-form-group">
                  <label>{t("accountIdRequired")}</label>
                  <input
                    type="text"
                    value={form.account_id}
                    onChange={(e) => setForm(f => ({ ...f, account_id: toUpper(e.target.value) }))}
                    disabled={isEditMode}
                    required
                  />
                </div>
                <div className="account-form-group">
                  <label>{t("nameRequired")}</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm(f => ({ ...f, name: toUpper(e.target.value) }))}
                    required
                  />
                </div>
                <div className="account-form-group">
                  <label>{t("roleRequired")}</label>
                  <select
                    value={form.role}
                    onChange={(e) => setForm(f => ({ ...f, role: e.target.value }))}
                    required
                  >
                    <option value="">{t("selectRole")}</option>
                    {orderedRoles.map(r => (
                      <option key={r} value={r}>
                        {toUpper(r) === "UPLINE" ? t("supplier") : r}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="account-form-group">
                  <label>{t("passwordRequired")}</label>
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
                <h3 className="account-section-header">{t("payment")}</h3>
                <div className="account-form-group">
                  <label>{t("paymentAlert")}</label>
                  <div className="account-radio-group">
                    <label className="account-radio-label">
                      <input
                        type="radio"
                        name="payment_alert"
                        value="1"
                        checked={form.payment_alert === "1"}
                        onChange={() => setForm(f => ({ ...f, payment_alert: "1" }))}
                      />
                      {t("yes")}
                    </label>
                    <label className="account-radio-label">
                      <input
                        type="radio"
                        name="payment_alert"
                        value="0"
                        checked={form.payment_alert === "0"}
                        onChange={() => setForm(f => ({ ...f, payment_alert: "0", alert_type: "", alert_start_date: "", alert_amount: "" }))}
                      />
                      {t("noWord")}
                    </label>
                  </div>
                </div>

                {form.payment_alert === "1" && (
                  <div className="account-form-row">
                    <div className="account-form-group">
                      <label>{t("alertType")}</label>
                      <select
                        value={form.alert_type}
                        onChange={(e) => setForm(f => ({ ...f, alert_type: e.target.value }))}
                      >
                        <option value="">{t("selectType")}</option>
                        <option value="weekly">{t("weekly")}</option>
                        <option value="monthly">{t("monthly")}</option>
                        {Array.from({ length: 31 }, (_, i) => (
                          <option key={i + 1} value={String(i + 1)}>
                            {t("days", { n: i + 1 })}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="account-form-group">
                      <label>{t("startDate")}</label>
                      <input
                        type="date"
                        value={form.alert_start_date}
                        onChange={(e) => setForm(f => ({ ...f, alert_start_date: e.target.value }))}
                      />
                    </div>
                  </div>
                )}
                {form.payment_alert === "1" && (
                  <div className="account-form-group">
                    <label>{t("alertAmount")}</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder={t("enterAmountPlaceholder")}
                      value={form.alert_amount || ""}
                      onChange={(e) => setForm((f) => ({ ...f, alert_amount: e.target.value }))}
                    />
                  </div>
                )}

                <div className="account-form-group">
                  <label>{t("remark")}</label>
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
                <h3>{t("advancedAccount")}</h3>
                <div className="account-other-currency">
                  <label>{t("otherCurrency")}</label>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <input
                      type="text"
                      placeholder={t("newCurrencyPlaceholder")}
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
                      {t("createCurrency")}
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
                  <label>{t("company")}</label>
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
                {isEditMode ? t("updateAccount") : t("addAccount")}
              </button>
              <button type="button" className="account-btn account-btn-cancel" onClick={onClose}>
                {t("cancel")}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

