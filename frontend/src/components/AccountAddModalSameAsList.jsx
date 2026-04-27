import { useEffect, useMemo, useState } from "react";
import { buildApiUrl } from "../utils/apiUrl.js";

const ROLE_PRIORITY = ["CAPITAL", "BANK", "CASH", "PROFIT", "EXPENSES", "COMPANY", "PARTNER", "STAFF", "SUPPLIER", "AGENT", "MEMBER", "DEBTOR"];

const DEFAULT_FORM = {
  id: "",
  account_id: "",
  name: "",
  role: "",
  password: "",
  remark: "",
  payment_alert: "0",
  alert_type: "",
  alert_start_date: "",
  alert_amount: "",
};

function toUpper(v) {
  return String(v || "").toUpperCase();
}

function normalizeAlertAmount(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const num = Number(raw);
  if (Number.isNaN(num)) return "";
  if (num > 0) return `-${num}`;
  return String(num);
}

/**
 * Add Account modal markup and behavior aligned with {@link frontend/src/pages/AccountListPage.jsx} (add mode only).
 */
export default function AccountAddModalSameAsList({ open, onClose, companyId, companies, roles, currencies, setCurrencies, notify, onSuccess }) {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [selectedCurrencyIds, setSelectedCurrencyIds] = useState([]);
  const [selectedCompanyIds, setSelectedCompanyIds] = useState([]);
  const [currencyInput, setCurrencyInput] = useState("");

  useEffect(() => {
    if (!open || !companyId) return;
    setForm({ ...DEFAULT_FORM, payment_alert: "0" });
    setSelectedCurrencyIds([]);
    setSelectedCompanyIds([Number(companyId)]);
    setCurrencyInput("");
  }, [open, companyId]);

  const orderedRoles = useMemo(() => {
    const map = new Map();
    roles.forEach((r) => {
      const t = String(r || "").trim();
      if (t) map.set(toUpper(t), t);
    });
    ["PARTNER", "STAFF", "DEBTOR"].forEach((r) => {
      if (!map.has(r)) map.set(r, r);
    });
    const out = [];
    ROLE_PRIORITY.forEach((p) => {
      if (map.has(p)) {
        out.push(map.get(p));
        map.delete(p);
      } else if (p === "SUPPLIER" && map.has("UPLINE")) {
        out.push(map.get("UPLINE"));
        map.delete("UPLINE");
      }
    });
    return [...out, ...Array.from(map.values()).sort((a, b) => a.localeCompare(b))];
  }, [roles]);

  const allCompanyButtons = useMemo(() => companies.filter((c) => c.company_id && String(c.company_id).trim() !== ""), [companies]);

  const createCurrency = async () => {
    const code = toUpper(currencyInput).trim();
    if (!code) return;
    const targetCompany = selectedCompanyIds[0] || companyId;
    if (!targetCompany) return notify("Please select a company first", "danger");
    try {
      const res = await fetch(buildApiUrl("api/accounts/create_currency_api.php"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, company_id: targetCompany }),
        credentials: "include",
      });
      const json = await res.json();
      if (!json.success || !json.data) return notify(json.message || json.error || "Failed to create currency", "danger");
      setCurrencies((prev) => [...prev, { id: json.data.id, code: json.data.code, is_linked: false }]);
      setCurrencyInput("");
      notify(`Currency ${code} created`, "success");
    } catch {
      notify("Failed to create currency", "danger");
    }
  };

  const removeCurrency = async (cid) => {
    try {
      const res = await fetch(buildApiUrl("api/accounts/delete_currency_api.php"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: cid }),
        credentials: "include",
      });
      const json = await res.json();
      if (!json.success) return notify(json.error || "Failed to delete currency", "danger");
      setCurrencies((prev) => prev.filter((c) => Number(c.id) !== Number(cid)));
      setSelectedCurrencyIds((prev) => prev.filter((x) => Number(x) !== Number(cid)));
    } catch {
      notify("Failed to delete currency", "danger");
    }
  };

  const saveForm = async (e) => {
    e.preventDefault();
    const alertAmount = normalizeAlertAmount(form.alert_amount);
    if (form.payment_alert === "1" && (!form.alert_type || !form.alert_start_date)) {
      return notify("When Payment Alert is Yes, Alert Type and Start Date are required.", "danger");
    }
    if (form.payment_alert === "1" && alertAmount && Number(alertAmount) >= 0) {
      return notify("Alert Amount must be negative.", "danger");
    }

    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => {
      if (k === "alert_amount") fd.append(k, alertAmount);
      else fd.append(k, v ?? "");
    });
    if (form.payment_alert === "0") {
      fd.set("alert_type", "");
      fd.set("alert_start_date", "");
      fd.set("alert_amount", "");
    }
    if (selectedCompanyIds.length) fd.set("company_ids", JSON.stringify(selectedCompanyIds));
    if (companyId) fd.set("company_id", String(companyId));
    if (selectedCurrencyIds.length) fd.set("currency_ids", JSON.stringify(selectedCurrencyIds));

    try {
      const res = await fetch(buildApiUrl("api/accounts/addaccountapi.php"), { method: "POST", body: fd, credentials: "include" });
      const json = await res.json();
      if (!json.success) return notify(json.message || json.error || "Save failed", "danger");

      if (json?.data?.id && selectedCompanyIds.length) {
        await Promise.all(
          selectedCompanyIds.map((cid) =>
            fetch(buildApiUrl("api/accounts/account_company_api.php?action=add_company"), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ account_id: json.data.id, company_id: cid }),
              credentials: "include",
            })
          )
        );
      }
      if (json?.data?.id && selectedCurrencyIds.length) {
        await Promise.all(
          selectedCurrencyIds.map((cur) =>
            fetch(buildApiUrl("api/accounts/account_currency_api.php?action=add_currency"), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ account_id: json.data.id, currency_id: cur }),
              credentials: "include",
            })
          )
        );
      }
      onClose();
      notify("Account added successfully", "success");
      onSuccess?.(json.data);
    } catch {
      notify("Save failed", "danger");
    }
  };

  if (!open) return null;

  return (
    <div id="addAccountModal" className="account-modal" style={{ display: "block" }}>
      <div className="account-modal-content">
        <div className="account-modal-header">
          <h2>Add Account</h2>
          <span className="account-close" onClick={onClose} role="presentation">
            &times;
          </span>
        </div>
        <div className="account-modal-body">
          <form className="account-form" onSubmit={saveForm}>
            <div className="account-form-columns">
              <div className="account-form-column">
                <h3 className="account-section-header">Personal Information</h3>
                <div className="account-form-group">
                  <label>Account ID *</label>
                  <input value={form.account_id} onChange={(e) => setForm((f) => ({ ...f, account_id: toUpper(e.target.value) }))} required />
                </div>
                <div className="account-form-group">
                  <label>Name *</label>
                  <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: toUpper(e.target.value) }))} required />
                </div>
                <div className="account-form-group">
                  <label>Role *</label>
                  <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} required>
                    <option value="">Select Role</option>
                    {orderedRoles.map((r) => (
                      <option key={r} value={r}>
                        {toUpper(r) === "UPLINE" ? "SUPPLIER" : r}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="account-form-group">
                  <label>Password *</label>
                  <input type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} required />
                </div>
              </div>
              <div className="account-form-column">
                <h3 className="account-section-header">Payment</h3>
                <div className="account-form-group">
                  <label>Payment Alert</label>
                  <div className="account-radio-group">
                    <label className="account-radio-label">
                      <input type="radio" checked={form.payment_alert === "1"} onChange={() => setForm((f) => ({ ...f, payment_alert: "1" }))} />
                      Yes
                    </label>
                    <label className="account-radio-label">
                      <input
                        type="radio"
                        checked={form.payment_alert === "0"}
                        onChange={() => setForm((f) => ({ ...f, payment_alert: "0", alert_type: "", alert_start_date: "", alert_amount: "" }))}
                      />
                      No
                    </label>
                  </div>
                </div>
                {form.payment_alert === "1" && (
                  <>
                    <div className="account-form-row" style={{ display: "flex" }}>
                      <div className="account-form-group">
                        <label>Alert Type</label>
                        <select value={form.alert_type} onChange={(e) => setForm((f) => ({ ...f, alert_type: e.target.value }))}>
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
                        <input type="date" value={form.alert_start_date} onChange={(e) => setForm((f) => ({ ...f, alert_start_date: e.target.value }))} />
                      </div>
                    </div>
                    <div className="account-form-group">
                      <label>Alert (Amount)</label>
                      <input type="number" step="0.01" value={form.alert_amount} onChange={(e) => setForm((f) => ({ ...f, alert_amount: e.target.value }))} />
                    </div>
                  </>
                )}
                <div className="account-form-group">
                  <label>Remark</label>
                  <textarea rows={1} style={{ resize: "none", overflowY: "hidden", lineHeight: 1.5 }} value={form.remark} onChange={(e) => setForm((f) => ({ ...f, remark: toUpper(e.target.value) }))} />
                </div>
              </div>
            </div>
            <div className="account-form-section">
              <div className="account-advance-section">
                <h3>Advanced Account</h3>
                <div className="account-other-currency">
                  <label>Other Currency:</label>
                  <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                    <input value={currencyInput} onChange={(e) => setCurrencyInput(e.target.value)} placeholder="Enter new currency code" />
                    <button type="button" className="account-btn-add-currency" onClick={createCurrency}>
                      Create Currency
                    </button>
                  </div>
                  <div className="account-currency-list">
                    {currencies.map((c) => (
                      <div key={c.id} className={`account-currency-item currency-toggle-item ${selectedCurrencyIds.includes(Number(c.id)) ? "selected" : ""}`}>
                        <span className="currency-code-text" onClick={() => setSelectedCurrencyIds((prev) => (prev.includes(Number(c.id)) ? prev.filter((x) => Number(x) !== Number(c.id)) : [...prev, Number(c.id)]))}>
                          {toUpper(c.code)}
                        </span>
                        <button type="button" className="currency-delete-btn" onClick={() => removeCurrency(c.id)}>
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="account-other-currency" style={{ marginTop: 20 }}>
                  <label>Company:</label>
                  <div className="account-currency-list">
                    {allCompanyButtons.map((c) => (
                      <div
                        key={c.id}
                        className={`account-currency-item currency-toggle-item ${selectedCompanyIds.includes(Number(c.id)) ? "selected" : ""}`}
                        onClick={() => setSelectedCompanyIds((prev) => (prev.includes(Number(c.id)) ? prev.filter((x) => Number(x) !== Number(c.id)) : [...prev, Number(c.id)]))}
                        role="presentation"
                      >
                        {toUpper(c.company_id)}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="account-form-actions">
              <button className="account-btn account-btn-save" type="submit">
                Add Account
              </button>
              <button className="account-btn account-btn-cancel" type="button" onClick={onClose}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
