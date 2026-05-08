import { useState, useEffect } from "react";
import { buildApiUrl } from "../../../utils/apiUrl.js";
import { showDomainAlert } from "./DomainNotification.jsx";
import { getDomainText } from "../../../translateFile/domainTranslate.js";
import DomainModalPortal from "./DomainModalPortal.jsx";

const ALERT_TYPE_OPTIONS = [
  "weekly", "monthly",
  ...Array.from({ length: 31 }, (_, i) => String(i + 1)),
];

/**
 * Add Account Modal — create new account from domain page
 * Props:
 *   companyId        — numeric company id for session
 *   companyCode      — string company code (e.g. "C168")
 *   preferredRole    — string, pre-select role (e.g. "PROFIT")
 *   onClose()
 *   onSuccess(newAccountId) — called after account created
 */
export default function AddAccountModal({ companyId, companyCode, preferredRole, onClose, onSuccess, lang = "en" }) {
  const t = (key, params) => getDomainText(lang, key, params);
  const [roles, setRoles] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [selectedCurrencyIds, setSelectedCurrencyIds] = useState([]);
  const [deletedCurrencyIds, setDeletedCurrencyIds] = useState([]);
  const [paymentAlert, setPaymentAlert] = useState("0");
  const [newCurrencyInput, setNewCurrencyInput] = useState("");

  // form fields
  const [accountId, setAccountId] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [password, setPassword] = useState("");
  const [alertType, setAlertType] = useState("");
  const [alertStartDate, setAlertStartDate] = useState("");
  const [alertAmount, setAlertAmount] = useState("");
  const [remark, setRemark] = useState("");

  useEffect(() => {
    // Load roles
    fetch(buildApiUrl("api/editdata/editdata_api.php"), { cache: "no-cache" })
      .then((r) => r.json())
      .then((json) => {
        if (json.success && json.data) {
          setRoles(Array.isArray(json.data.roles) ? json.data.roles : []);
          // Auto-select preferred role
          if (preferredRole) {
            const wanted = preferredRole.toUpperCase() === "SUPPLIER" ? "UPLINE" : preferredRole.toUpperCase();
            setRole(wanted);
          }
        }
      })
      .catch(() => showDomainAlert(t("loadAccountFormFailed"), "danger"));

    // Load currencies
    loadCurrencies();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadCurrencies() {
    try {
      const res = await fetch(buildApiUrl("api/accounts/account_currency_api.php?action=get_available_currencies"), { cache: "no-cache" });
      const json = await res.json();
      const list = json.success && Array.isArray(json.data) ? json.data : [];
      setCurrencies(list);
      if (list.length > 0 && selectedCurrencyIds.length === 0) {
        const auto = list.find((c) => String(c.code || "").toUpperCase() === "MYR") || list[0];
        if (auto) setSelectedCurrencyIds([auto.id]);
      }
    } catch {
      setCurrencies([]);
    }
  }

  async function addCurrency() {
    const code = newCurrencyInput.trim().toUpperCase();
    if (!code) { showDomainAlert(t("pleaseEnterCurrencyCode"), "danger"); return; }
    if (currencies.some((c) => String(c.code || "").toUpperCase() === code)) {
      showDomainAlert(t("currencyExists", { code }));
      setNewCurrencyInput("");
      return;
    }
    try {
      const res = await fetch(buildApiUrl("api/accounts/addcurrencyapi.php"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, company_id: companyId }),
      });
      const json = await res.json();
      if (!json.success || !json.data?.id) {
        showDomainAlert(json.error || json.message || t("createCurrencyFailed"), "danger");
        return;
      }
      setCurrencies((prev) => [...prev, { id: json.data.id, code: json.data.code }]);
      setSelectedCurrencyIds((prev) => prev.includes(json.data.id) ? prev : [...prev, json.data.id]);
      setNewCurrencyInput("");
      showDomainAlert(t("currencyCreatedSuccess", { code }));
    } catch {
      showDomainAlert(t("createCurrencyFailed"), "danger");
    }
  }

  async function deleteCurrency(currencyId, code) {
    if (!confirm(t("confirmDeleteCurrency", { code }))) return;
    try {
      const res = await fetch(buildApiUrl("api/accounts/delete_currency_api.php"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: currencyId }),
      });
      const json = await res.json();
      if (!json.success) { showDomainAlert(json.error || json.message || t("deleteCurrencyFailed"), "danger"); return; }
      setDeletedCurrencyIds((prev) => [...prev, currencyId]);
      setSelectedCurrencyIds((prev) => prev.filter((id) => id !== currencyId));
      setCurrencies((prev) => prev.filter((c) => c.id !== currencyId));
      showDomainAlert(t("deleteCurrencySuccess", { code }));
    } catch {
      showDomainAlert(t("deleteCurrencyFailed"), "danger");
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const fd = new FormData();
    fd.append("account_id", accountId);
    fd.append("name", name);
    fd.append("role", role);
    fd.append("password", password);
    fd.append("payment_alert", paymentAlert);
    if (paymentAlert === "1") {
      fd.append("alert_type", alertType);
      fd.append("alert_start_date", alertStartDate);
      fd.append("alert_amount", alertAmount);
    } else {
      fd.append("alert_type", "");
      fd.append("alert_start_date", "");
      fd.append("alert_amount", "");
    }
    fd.append("remark", remark);
    if (selectedCurrencyIds.length) fd.append("currency_ids", JSON.stringify(selectedCurrencyIds));
    const cId = companyId ? parseInt(companyId, 10) : 0;
    if (cId) fd.append("company_ids", JSON.stringify([cId]));

    try {
      const res = await fetch(buildApiUrl("api/accounts/addaccountapi.php"), { method: "POST", body: fd });
      const json = await res.json();
      if (!json.success) { showDomainAlert(json.error || json.message || t("addAccountFailed"), "danger"); return; }
      const newId = json.data?.id ? parseInt(json.data.id, 10) : 0;
      if (newId && selectedCurrencyIds.length) {
        await Promise.all(selectedCurrencyIds.map((cid) =>
          fetch(buildApiUrl("api/accounts/account_currency_api.php?action=add_currency"), {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ account_id: newId, currency_id: cid }),
          }).catch(() => null)
        ));
      }
      if (newId && cId) {
        await fetch(buildApiUrl("api/accounts/account_company_api.php?action=add_company"), {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ account_id: newId, company_id: cId }),
        }).catch(() => null);
      }
      showDomainAlert(t("addAccountSuccess"));
      onSuccess && onSuccess(newId);
      onClose();
    } catch {
      showDomainAlert(t("addAccountFailed"), "danger");
    }
  }

  const toggleCurrencyId = (id) => {
    setSelectedCurrencyIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const visibleCurrencies = currencies.filter((c) => !deletedCurrencyIds.includes(c.id));

  return (
    <DomainModalPortal>
      <div className="account-modal" style={{ display: "block", zIndex: 2147483002 }}>
        <div className="account-modal-content">
        <div className="account-modal-header">
          <h2>{t("addAccountTitle")}</h2>
          <span className="account-close" onClick={onClose}>&times;</span>
        </div>
        <div className="account-modal-body">
          <form className="account-form" onSubmit={handleSubmit}>
            <div className="account-form-columns">
              {/* Personal info */}
              <div className="account-form-column">
                <h3 className="account-section-header">{t("personalInformation")}</h3>
                <div className="account-form-group">
                  <label htmlFor="da_account_id">{t("accountId")} *</label>
                  <input type="text" id="da_account_id" required value={accountId} onChange={(e) => setAccountId(e.target.value)} />
                </div>
                <div className="account-form-group">
                  <label htmlFor="da_name">{t("name")} *</label>
                  <input type="text" id="da_name" required value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="account-form-group">
                  <label htmlFor="da_role">{t("role")} *</label>
                  <select id="da_role" required value={role} onChange={(e) => setRole(e.target.value)}>
                    <option value="">{t("selectRole")}</option>
                    {roles.map((r) => (
                      <option key={r} value={r}>{String(r).toUpperCase() === "UPLINE" ? "SUPPLIER" : r}</option>
                    ))}
                  </select>
                </div>
                <div className="account-form-group">
                  <label htmlFor="da_password">{t("password")} *</label>
                  <input type="password" id="da_password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
              </div>
              {/* Payment */}
              <div className="account-form-column">
                <h3 className="account-section-header">{t("payment")}</h3>
                <div className="account-form-group">
                  <label>{t("paymentAlert")}</label>
                  <div className="account-radio-group">
                    <label className="account-radio-label">
                      <input type="radio" value="1" checked={paymentAlert === "1"} onChange={() => setPaymentAlert("1")} /> {t("yes")}
                    </label>
                    <label className="account-radio-label">
                      <input type="radio" value="0" checked={paymentAlert === "0"} onChange={() => setPaymentAlert("0")} /> {t("noWord")}
                    </label>
                  </div>
                </div>
                {paymentAlert === "1" && (
                  <div className="account-form-row">
                    <div className="account-form-group">
                      <label htmlFor="da_alert_type">{t("alertType")}</label>
                      <select id="da_alert_type" value={alertType} onChange={(e) => setAlertType(e.target.value)}>
                        <option value="">{t("selectType")}</option>
                        <option value="weekly">{t("weekly")}</option>
                        <option value="monthly">{t("monthly")}</option>
                        {Array.from({ length: 31 }, (_, i) => (
                          <option key={i + 1} value={String(i + 1)}>{t("days", { n: i + 1 })}</option>
                        ))}
                      </select>
                    </div>
                    <div className="account-form-group">
                      <label htmlFor="da_alert_start">{t("startDate")}</label>
                      <input type="date" id="da_alert_start" value={alertStartDate} onChange={(e) => setAlertStartDate(e.target.value)} />
                    </div>
                  </div>
                )}
                {paymentAlert === "1" && (
                  <div className="account-form-group">
                    <label htmlFor="da_alert_amount">{t("alertAmount")}</label>
                    <input type="number" id="da_alert_amount" step="0.01" placeholder={t("enterAmount")} value={alertAmount} onChange={(e) => setAlertAmount(e.target.value)} />
                  </div>
                )}
                <div className="account-form-group">
                  <label htmlFor="da_remark">{t("remark")}</label>
                  <textarea id="da_remark" rows="1" style={{ resize: "none", overflowY: "hidden", lineHeight: 1.5 }} value={remark} onChange={(e) => setRemark(e.target.value)} />
                </div>
              </div>
            </div>
            {/* Advanced */}
            <div className="account-form-section">
              <div className="account-advance-section">
                <h3>{t("advancedAccount")}</h3>
                <div className="account-other-currency">
                  <label>{t("otherCurrency")}</label>
                  <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                    <input
                      type="text"
                      placeholder={t("newCurrencyPlaceholder")}
                      style={{ flex: 1, padding: 8, border: "1px solid #ddd", borderRadius: 4 }}
                      value={newCurrencyInput}
                      onChange={(e) => setNewCurrencyInput(e.target.value.toUpperCase())}
                      onKeyPress={(e) => { if (e.key === "Enter") { e.preventDefault(); addCurrency(); } }}
                    />
                    <button type="button" className="account-btn-add-currency" onClick={addCurrency}>{t("createCurrency")}</button>
                  </div>
                  <div className="account-currency-list">
                    {visibleCurrencies.length === 0 && <div className="currency-toggle-note">{t("noCurrenciesAvailable")}</div>}
                    {visibleCurrencies.map((c) => (
                      <div
                        key={c.id}
                        className={`account-currency-item currency-toggle-item${selectedCurrencyIds.includes(c.id) ? " selected" : ""}`}
                      >
                        <span className="currency-code-text" onClick={() => toggleCurrencyId(c.id)}>
                          {String(c.code || "").toUpperCase()}
                        </span>
                        <button
                          type="button" className="currency-delete-btn" title={t("deleteCurrencyPermanently")}
                          onClick={(e) => { e.stopPropagation(); deleteCurrency(c.id, String(c.code || "").toUpperCase()); }}
                        >&times;</button>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="account-other-currency" style={{ marginTop: 20 }}>
                  <label>{t("companyLabel")}</label>
                  <div className="account-currency-list">
                    <div className="account-currency-item currency-toggle-item selected">
                      {companyCode || "C168"}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="account-form-actions">
              <button type="submit" className="account-btn account-btn-save">{t("addAccountBtn")}</button>
              <button type="button" className="account-btn account-btn-cancel" onClick={onClose}>{t("cancel")}</button>
            </div>
          </form>
        </div>
        </div>
      </div>
    </DomainModalPortal>
  );
}
