import { useState, useEffect } from "react";
import { buildApiUrl } from "../../../utils/apiUrl.js";
import { showDomainAlert } from "./DomainNotification.jsx";

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
  const isZh = lang === "zh";
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
      .catch(() => showDomainAlert(isZh ? "加载账号表单数据失败。" : "Failed to load account form data.", "danger"));

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
    if (!code) { showDomainAlert(isZh ? "请输入币种代码" : "Please enter currency code", "danger"); return; }
    if (currencies.some((c) => String(c.code || "").toUpperCase() === code)) {
      showDomainAlert(isZh ? `币种 ${code} 已存在` : `Currency ${code} already exists`);
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
        showDomainAlert(json.error || json.message || (isZh ? "创建币种失败" : "Failed to create currency"), "danger");
        return;
      }
      setCurrencies((prev) => [...prev, { id: json.data.id, code: json.data.code }]);
      setSelectedCurrencyIds((prev) => prev.includes(json.data.id) ? prev : [...prev, json.data.id]);
      setNewCurrencyInput("");
      showDomainAlert(isZh ? `币种 ${code} 创建成功` : `Currency ${code} created successfully`);
    } catch {
      showDomainAlert(isZh ? "创建币种失败" : "Failed to create currency", "danger");
    }
  }

  async function deleteCurrency(currencyId, code) {
    if (!confirm(isZh ? `确定永久删除币种 ${code} 吗？此操作不可撤销。` : `Are you sure you want to permanently delete currency ${code}? This action cannot be undone.`)) return;
    try {
      const res = await fetch(buildApiUrl("api/accounts/delete_currency_api.php"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: currencyId }),
      });
      const json = await res.json();
      if (!json.success) { showDomainAlert(json.error || json.message || (isZh ? "删除币种失败" : "Failed to delete currency"), "danger"); return; }
      setDeletedCurrencyIds((prev) => [...prev, currencyId]);
      setSelectedCurrencyIds((prev) => prev.filter((id) => id !== currencyId));
      setCurrencies((prev) => prev.filter((c) => c.id !== currencyId));
      showDomainAlert(isZh ? `币种 ${code} 删除成功！` : `Currency ${code} deleted successfully!`);
    } catch {
      showDomainAlert(isZh ? "删除币种失败" : "Failed to delete currency", "danger");
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
      if (!json.success) { showDomainAlert(json.error || json.message || (isZh ? "新增账号失败" : "Failed to add account"), "danger"); return; }
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
      showDomainAlert(isZh ? "账号新增成功。" : "Account added successfully.");
      onSuccess && onSuccess(newId);
      onClose();
    } catch {
      showDomainAlert(isZh ? "新增账号失败" : "Failed to add account", "danger");
    }
  }

  const toggleCurrencyId = (id) => {
    setSelectedCurrencyIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const visibleCurrencies = currencies.filter((c) => !deletedCurrencyIds.includes(c.id));

  return (
    <div className="account-modal" style={{ display: "block", zIndex: 10010 }}>
      <div className="account-modal-content">
        <div className="account-modal-header">
          <h2>{isZh ? "新增账号" : "Add Account"}</h2>
          <span className="account-close" onClick={onClose}>&times;</span>
        </div>
        <div className="account-modal-body">
          <form className="account-form" onSubmit={handleSubmit}>
            <div className="account-form-columns">
              {/* Personal info */}
              <div className="account-form-column">
                <h3 className="account-section-header">{isZh ? "个人信息" : "Personal Information"}</h3>
                <div className="account-form-group">
                  <label htmlFor="da_account_id">{isZh ? "账号 ID" : "Account ID"} *</label>
                  <input type="text" id="da_account_id" required value={accountId} onChange={(e) => setAccountId(e.target.value)} />
                </div>
                <div className="account-form-group">
                  <label htmlFor="da_name">{isZh ? "名称" : "Name"} *</label>
                  <input type="text" id="da_name" required value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="account-form-group">
                  <label htmlFor="da_role">{isZh ? "角色" : "Role"} *</label>
                  <select id="da_role" required value={role} onChange={(e) => setRole(e.target.value)}>
                    <option value="">{isZh ? "选择角色" : "Select Role"}</option>
                    {roles.map((r) => (
                      <option key={r} value={r}>{String(r).toUpperCase() === "UPLINE" ? "SUPPLIER" : r}</option>
                    ))}
                  </select>
                </div>
                <div className="account-form-group">
                  <label htmlFor="da_password">{isZh ? "密码" : "Password"} *</label>
                  <input type="password" id="da_password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
              </div>
              {/* Payment */}
              <div className="account-form-column">
                <h3 className="account-section-header">{isZh ? "支付" : "Payment"}</h3>
                <div className="account-form-group">
                  <label>{isZh ? "支付提醒" : "Payment Alert"}</label>
                  <div className="account-radio-group">
                    <label className="account-radio-label">
                      <input type="radio" value="1" checked={paymentAlert === "1"} onChange={() => setPaymentAlert("1")} /> {isZh ? "是" : "Yes"}
                    </label>
                    <label className="account-radio-label">
                      <input type="radio" value="0" checked={paymentAlert === "0"} onChange={() => setPaymentAlert("0")} /> {isZh ? "否" : "No"}
                    </label>
                  </div>
                </div>
                {paymentAlert === "1" && (
                  <div className="account-form-row">
                    <div className="account-form-group">
                      <label htmlFor="da_alert_type">{isZh ? "提醒类型" : "Alert Type"}</label>
                      <select id="da_alert_type" value={alertType} onChange={(e) => setAlertType(e.target.value)}>
                        <option value="">{isZh ? "选择类型" : "Select Type"}</option>
                        <option value="weekly">{isZh ? "每周" : "Weekly"}</option>
                        <option value="monthly">{isZh ? "每月" : "Monthly"}</option>
                        {Array.from({ length: 31 }, (_, i) => (
                          <option key={i + 1} value={String(i + 1)}>{isZh ? `${i + 1} 天` : `${i + 1} Days`}</option>
                        ))}
                      </select>
                    </div>
                    <div className="account-form-group">
                      <label htmlFor="da_alert_start">{isZh ? "开始日期" : "Start Date"}</label>
                      <input type="date" id="da_alert_start" value={alertStartDate} onChange={(e) => setAlertStartDate(e.target.value)} />
                    </div>
                  </div>
                )}
                {paymentAlert === "1" && (
                  <div className="account-form-group">
                    <label htmlFor="da_alert_amount">{isZh ? "提醒金额" : "Alert (Amount)"}</label>
                    <input type="number" id="da_alert_amount" step="0.01" placeholder={isZh ? "输入金额" : "Enter amount"} value={alertAmount} onChange={(e) => setAlertAmount(e.target.value)} />
                  </div>
                )}
                <div className="account-form-group">
                  <label htmlFor="da_remark">{isZh ? "备注" : "Remark"}</label>
                  <textarea id="da_remark" rows="1" style={{ resize: "none", overflowY: "hidden", lineHeight: 1.5 }} value={remark} onChange={(e) => setRemark(e.target.value)} />
                </div>
              </div>
            </div>
            {/* Advanced */}
            <div className="account-form-section">
              <div className="account-advance-section">
                <h3>{isZh ? "高级账号" : "Advanced Account"}</h3>
                <div className="account-other-currency">
                  <label>{isZh ? "其他币种：" : "Other Currency:"}</label>
                  <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                    <input
                      type="text"
                      placeholder={isZh ? "输入新币种代码（例如 USD）" : "Enter new currency code (e.g., USD)"}
                      style={{ flex: 1, padding: 8, border: "1px solid #ddd", borderRadius: 4 }}
                      value={newCurrencyInput}
                      onChange={(e) => setNewCurrencyInput(e.target.value.toUpperCase())}
                      onKeyPress={(e) => { if (e.key === "Enter") { e.preventDefault(); addCurrency(); } }}
                    />
                    <button type="button" className="account-btn-add-currency" onClick={addCurrency}>{isZh ? "创建币种" : "Create Currency"}</button>
                  </div>
                  <div className="account-currency-list">
                    {visibleCurrencies.length === 0 && <div className="currency-toggle-note">{isZh ? "暂无可用币种。" : "No currencies available."}</div>}
                    {visibleCurrencies.map((c) => (
                      <div
                        key={c.id}
                        className={`account-currency-item currency-toggle-item${selectedCurrencyIds.includes(c.id) ? " selected" : ""}`}
                      >
                        <span className="currency-code-text" onClick={() => toggleCurrencyId(c.id)}>
                          {String(c.code || "").toUpperCase()}
                        </span>
                        <button
                          type="button" className="currency-delete-btn" title={isZh ? "永久删除币种" : "Delete currency permanently"}
                          onClick={(e) => { e.stopPropagation(); deleteCurrency(c.id, String(c.code || "").toUpperCase()); }}
                        >&times;</button>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="account-other-currency" style={{ marginTop: 20 }}>
                  <label>{isZh ? "公司：" : "Company:"}</label>
                  <div className="account-currency-list">
                    <div className="account-currency-item currency-toggle-item selected">
                      {companyCode || "C168"}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="account-form-actions">
              <button type="submit" className="account-btn account-btn-save">{isZh ? "新增账号" : "Add Account"}</button>
              <button type="button" className="account-btn account-btn-cancel" onClick={onClose}>{isZh ? "取消" : "Cancel"}</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
