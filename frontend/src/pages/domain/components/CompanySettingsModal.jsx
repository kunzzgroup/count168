import { useState, useEffect, useCallback } from "react";
import { buildApiUrl } from "../../../utils/apiUrl.js";
import { showDomainAlert } from "./DomainNotification.jsx";
import {
  SINGLE_CATEGORY_MODE,
  calculateExpirationDate,
  formatDate,
  defaultFeeShareAllocations,
  normalizeFeeShareFromServer,
  ensureCompanyFeeShare,
  isFeeShareAllocationsEmpty,
  pruneEmptyShareRows,
  sumFeeShareRolePercentages,
  computeShareTotals,
  formatShareRowAmount2,
} from "../domainHelpers.js";
import AddAccountModal from "./AddAccountModal.jsx";

const PERMISSION_LIST = [
  { value: "Games", id: "permGambling" },
  { value: "Bank",  id: "permBank" },
  { value: "Loan",  id: "permLoan" },
  { value: "Rate",  id: "permRate" },
  { value: "Money", id: "permMoney" },
];

const SHARE_ROLES = ["profit", "sales", "cs", "it"];

/**
 * Company Settings Modal — expiration date + permissions + share %
 *
 * Props:
 *   company          — the tempCompanies entry being edited (snapshot for cancel)
 *   domainFeePrice   — number, for share amount calculation
 *   sessionCompanyId — fallback if company.company_id is missing
 *   sessionCompanyCode — used for adding accounts
 *   onSave(updatedCompany) — callback with updated company data
 *   onClose()
 */
export default function CompanySettingsModal({
  company: initCompany,
  domainFeePrice,
  sessionCompanyId,
  sessionCompanyCode,
  onSave,
  onClose,
}) {
  // Local copy of company being edited
  const [company, setCompany] = useState(() => JSON.parse(JSON.stringify(initCompany)));
  const [period, setPeriod] = useState("");
  const [startDate, setStartDate] = useState(initCompany.startDate || new Date().toISOString().split("T")[0]);
  const [expDisplay, setExpDisplay] = useState(initCompany.expiration_date ? formatDate(initCompany.expiration_date) : "Not set");
  const [permissions, setPermissions] = useState(Array.isArray(initCompany.permissions) ? initCompany.permissions : []);
  const [chargeOnSave, setChargeOnSave] = useState(!!initCompany.apply_commission_payments_on_domain_save);

  // Share %
  const [shareAccounts, setShareAccounts] = useState([]);       // for sales/cs/it
  const [shareAccountsProfit, setShareAccountsProfit] = useState([]); // for profit
  const [fsa, setFsa] = useState(() => {
    const c = JSON.parse(JSON.stringify(initCompany));
    ensureCompanyFeeShare(c);
    return c.fee_share_allocations;
  });
  const [expandedCards, setExpandedCards] = useState({});
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [addAccountRole, setAddAccountRole] = useState("");

  const loadAccounts = useCallback(() => {
    fetch(buildApiUrl("api/domain/domain_api.php"), {
      cache: "no-cache",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "get_company_share_settings", company_id: company.company_id }),
    })
      .then((r) => r.json())
      .then((res) => {
        setShareAccounts(res.success && Array.isArray(res.data?.accounts) ? res.data.accounts : []);
        setShareAccountsProfit(res.success && Array.isArray(res.data?.accounts_profit) ? res.data.accounts_profit : []);
        // Only overwrite fsa if it was empty
        if (res.success && res.data?.company_exists && isFeeShareAllocationsEmpty(fsa)) {
          setFsa(normalizeFeeShareFromServer(res.data.allocations));
        }
      })
      .catch(() => { setShareAccounts([]); setShareAccountsProfit([]); });
  }, [company.company_id, fsa]);

  // Load share accounts from API
  useEffect(() => {
    loadAccounts();

    // Load permissions if not cached
    if (!Array.isArray(initCompany.permissions) || initCompany.permissions.length === 0) {
      fetch(buildApiUrl("api/domain/domain_api.php"), {
        cache: "no-cache",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get_company_permissions", company_id: company.company_id }),
      })
        .then((r) => r.json())
        .then((data) => {
          const perms = data.success && Array.isArray(data.data?.permissions) ? data.data.permissions : [];
          setPermissions(perms);
        })
        .catch(() => setPermissions([]));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recalculate expiration display whenever period/startDate changes
  useEffect(() => {
    if (!period) {
      setExpDisplay(company.expiration_date ? formatDate(company.expiration_date) : "Not set");
      return;
    }
    const base = company.isExtending
      ? company.originalExpirationDate || null
      : startDate || new Date().toISOString().split("T")[0];
    const exp = calculateExpirationDate(period, base);
    setExpDisplay(formatDate(exp));
    setCompany((prev) => ({ ...prev, expiration_date: exp, selectedPeriod: period }));
  }, [period, startDate]);

  function togglePermission(val) {
    if (SINGLE_CATEGORY_MODE) {
      setPermissions([val]);
    } else {
      setPermissions((prev) =>
        prev.includes(val) ? prev.filter((p) => p !== val) : [...prev, val]
      );
    }
  }

  function handleSave() {
    // Validate permissions
    if (SINGLE_CATEGORY_MODE) {
      if (permissions.length === 0) { showDomainAlert("Please select one category", "danger"); return; }
      if (permissions.length > 1)  { showDomainAlert("Only one category can be selected at a time", "danger"); return; }
    }

    let expDate = company.expiration_date || null;
    if (period) {
      const base = company.isExtending
        ? company.originalExpirationDate || null
        : startDate || new Date().toISOString().split("T")[0];
      expDate = calculateExpirationDate(period, base);
    }

    const cleanFsa = pruneEmptyShareRows(fsa);

    const permReq = fetch(buildApiUrl("api/domain/domain_api.php"), {
      cache: "no-cache",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update_company_permissions",
        company_id: company.company_id,
        permissions,
        expiration_date: expDate || null,
      }),
    }).then((r) => r.json());

    const shareReq = fetch(buildApiUrl("api/domain/domain_api.php"), {
      cache: "no-cache",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save_company_share_settings",
        company_id: company.company_id,
        fee_share_allocations: cleanFsa,
        apply_commission_payments: chargeOnSave,
      }),
    }).then((r) => r.json());

    Promise.all([permReq, shareReq])
      .then(([permData, shareData]) => {
        if (!permData.success) {
          showDomainAlert(permData.message || "Permissions save failed", "danger");
          return;
        }
        if (!shareData.success) {
          const msg = shareData.message || "";
          if (msg.includes("not found") || msg.includes("Save the domain first")) {
            showDomainAlert("Company settings updated. Share % will apply after you save the domain.");
          } else {
            showDomainAlert(msg || "Share % save failed", "danger");
            return;
          }
        } else {
          const hint = chargeOnSave ? " Fee posts when you Confirm the domain (main modal)." : "";
          showDomainAlert("Company settings updated successfully!" + hint);
        }
        onSave({
          ...company,
          expiration_date: expDate,
          selectedPeriod: period || company.selectedPeriod,
          permissions: [...permissions],
          fee_share_allocations: cleanFsa,
          apply_commission_payments_on_domain_save: chargeOnSave,
        });
      })
      .catch(() => {
        showDomainAlert("Could not reach server. Changes kept locally — try again.", "danger");
        onSave({ ...company, permissions: [...permissions], fee_share_allocations: pruneEmptyShareRows(fsa), apply_commission_payments_on_domain_save: chargeOnSave });
      });
  }

  // ─── Share % helpers ───────────────────────────────────────────────────────
  const totals = computeShareTotals(fsa, domainFeePrice);

  function updateShareRow(role, idx, field, value) {
    setFsa((prev) => {
      const rows = [...(prev[role] || [])];
      rows[idx] = { ...rows[idx], [field]: value };
      return { ...prev, [role]: rows };
    });
  }

  function addShareRow(role) {
    setFsa((prev) => {
      const pruned = pruneEmptyShareRows(prev);
      return { ...pruned, [role]: [...(pruned[role] || []), { account_id: 0, percentage: "" }] };
    });
    setExpandedCards((prev) => ({ ...prev, [role]: true }));
  }

  function removeShareRow(role, idx) {
    setFsa((prev) => {
      const rows = [...(prev[role] || [])];
      rows.splice(idx, 1);
      return { ...prev, [role]: rows };
    });
  }

  function toggleCard(role) {
    setExpandedCards((prev) => ({ ...prev, [role]: !prev[role] }));
  }

  function handleOpenAddAccount(role) {
    setAddAccountRole(role);
    setShowAddAccount(true);
  }

  const accountsForRole = (role) => role === "profit" ? shareAccountsProfit : shareAccounts;

  const roleTotals = {
    profit: totals.profitPool,
    sales: totals.salesSum,
    cs: totals.csSum,
    it: totals.itSum,
  };

  const rowAmounts = {
    profit: totals.profitRowAmounts,
    sales: totals.salesRowAmounts,
    cs: totals.csRowAmounts,
    it: totals.itRowAmounts,
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="modal" style={{ display: "block", zIndex: 10003 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-content company-settings-modal-content company-settings-modal-content--split">
        <span className="close" onClick={onClose}>&times;</span>
        <h2>Company Settings</h2>
        <div className="modal-body company-settings-modal-body">
          <div className="company-settings-split">
            {/* ── Left: General ── */}
            <div className="company-settings-split-left">
              <h3 className="company-settings-column-title">Company settings</h3>
              <div className="form-group">
                <label style={{ fontWeight: "bold", fontSize: "clamp(12px,1.04vw,16px)", color: "#1e293b", marginBottom: 15 }}>
                  Company: {company.company_id}
                </label>
              </div>
              {/* Start Date + Period */}
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                <div className="form-group" style={{ flex: 1, minWidth: 140 }}>
                  <label htmlFor="expDateStartDate">Start Date</label>
                  <input
                    type="date"
                    id="expDateStartDate"
                    className="form-group input"
                    value={startDate}
                    disabled={company.isExtending}
                    onChange={(e) => setStartDate(e.target.value)}
                    style={{ width: "100%", padding: "clamp(4px,0.31vw,6px) clamp(6px,0.63vw,12px)", border: "1px solid #d1d5db", borderRadius: "clamp(4px,0.42vw,8px)", fontSize: "clamp(9px,0.73vw,14px)" }}
                  />
                  <small style={{ color: company.isExtending ? "#ef4444" : "#64748b", fontSize: "clamp(7px,0.52vw,10px)", marginTop: 4, display: "block" }}>
                    {company.isExtending ? "Cannot modify start date when extending time" : "Select the start date for calculating expiration date"}
                  </small>
                </div>
                <div className="form-group" style={{ flex: 1, minWidth: 140 }}>
                  <label htmlFor="expDatePeriod">Period</label>
                  <select
                    id="expDatePeriod"
                    className="form-group input"
                    value={period}
                    onChange={(e) => setPeriod(e.target.value)}
                    style={{ width: "100%", padding: "clamp(5px,0.42vw,8px) clamp(6px,0.63vw,12px)", border: "1px solid #d1d5db", borderRadius: "clamp(4px,0.42vw,8px)", fontSize: "clamp(9px,0.73vw,14px)" }}
                  >
                    <option value="">Select Period</option>
                    <option value="7days">7 Days</option>
                    <option value="1month">1 Month</option>
                    <option value="3months">3 Months</option>
                    <option value="6months">6 Months</option>
                    <option value="1year">1 Year</option>
                  </select>
                </div>
              </div>
              {/* Expiration Date display */}
              <div className="form-group" style={{ marginBottom: 10 }}>
                <label style={{ fontSize: "clamp(9px,0.73vw,13px)" }}>Expiration Date</label>
                <div style={{ padding: "clamp(5px,0.5vw,8px)", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: "clamp(4px,0.42vw,6px)", fontSize: "clamp(10px,0.78vw,14px)", fontWeight: 600, color: expDisplay === "Not set" ? "#94a3b8" : "#1e293b", textAlign: "center" }}>
                  {expDisplay}
                </div>
              </div>
              {/* Permissions */}
              <div className="form-group" style={{ marginBottom: 8 }}>
                <label style={{ marginBottom: 2 }}>Permissions (for Process List &amp; Data Capture)</label>
                <div className="permission-toggle-row">
                  {PERMISSION_LIST.map(({ value, id }) => (
                    <label key={value} className={`permission-toggle-btn`} id={`permissionLabel${value}`}>
                      <input
                        type="checkbox"
                        id={id}
                        value={value}
                        className="permission-checkbox"
                        checked={permissions.includes(value)}
                        onChange={() => togglePermission(value)}
                      />
                      <span>{value}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="company-settings-split-divider" role="separator" aria-orientation="vertical" aria-hidden="true" />

            {/* ── Right: Share % ── */}
            <div className="company-settings-split-right">
              <div className="company-settings-share-header">
                <h3 className="company-settings-column-title company-settings-share-title">Share %</h3>
                <div className="company-share-charge-on-save">
                  <span className={`company-share-charge-on-save__state${chargeOnSave ? " company-share-charge-on-save__state--on" : ""}`} aria-hidden="true">
                    {chargeOnSave ? "On" : "Off"}
                  </span>
                  <label className="company-share-charge-switch">
                    <input
                      type="checkbox"
                      className="company-share-charge-switch__input"
                      role="switch"
                      aria-checked={chargeOnSave}
                      checked={chargeOnSave}
                      onChange={(e) => setChargeOnSave(e.target.checked)}
                    />
                    <span className="company-share-charge-switch__track" aria-hidden="true">
                      <span className="company-share-charge-switch__thumb" />
                    </span>
                  </label>
                </div>
              </div>

              {/* Grand total bar */}
              <div className="company-share-grand-total" style={{ display: "none" }}>
                <span>{totals.grand.toFixed(2)}%</span>
              </div>

              <div className="company-share-scroll">
                {SHARE_ROLES.map((role) => {
                  const isProfit = role === "profit";
                  const total = roleTotals[role];
                  const rows = fsa[role] || [];
                  const amounts = rowAmounts[role] || [];
                  const accounts = accountsForRole(role);
                  const isExpanded = !!expandedCards[role];
                  const assignedCount = rows.filter((r) => parseInt(r.account_id, 10) !== 0).length;
                  const cardId = `shareRows${role.charAt(0).toUpperCase() + role.slice(1)}`;

                  return (
                    <div key={role}
                      className={`company-share-role-card${isProfit ? " company-share-role-card--profit-pool" : ""}${rows.length === 0 ? " company-share-role-card--empty" : ""}`}
                      data-share-card={role}>
                      <div
                        className="company-share-role-header"
                        role="button" tabIndex={0}
                        aria-expanded={isExpanded}
                        aria-controls={cardId}
                        onClick={() => toggleCard(role)}
                        onKeyDown={(e) => e.key === "Enter" && toggleCard(role)}
                      >
                        <div className="company-share-role-header-left">
                          <span className={`company-share-role-badge company-share-role-badge--${role}`}>
                            {role.charAt(0).toUpperCase() + role.slice(1)}
                          </span>
                          <span className="company-share-account-count-display">
                            {assignedCount === 1 ? "1 account" : `${assignedCount} accounts`}
                          </span>
                        </div>
                        <div className="company-share-role-header-middle">
                          <div className="company-share-role-alloc-row">
                            <span className="company-share-role-alloc-label">Share total</span>
                            <span className={`company-share-card-sum${total > 100 ? " company-share-card-sum--over" : ""}`}>
                              {total.toFixed(2)}%
                            </span>
                          </div>
                          <div className="company-share-progress-track">
                            <div
                              className={`company-share-progress-fill${total > 100 ? " company-share-progress-fill--over" : ""}`}
                              style={{ width: `${Math.min(100, Math.max(0, total))}%` }}
                            />
                          </div>
                        </div>
                        <div className="company-share-role-header-right">
                          <button type="button" className="company-share-btn-manage"
                            onClick={(e) => { e.stopPropagation(); toggleCard(role); }}>
                            Manage
                          </button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="company-share-role-body">
                          <div className={`company-share-column-labels${isProfit ? " company-share-column-labels--profit-pool" : ""}`}>
                            <span>Account</span>
                            {!isProfit && <span>Share</span>}
                            <span>Total</span>
                            <span className="company-share-col-actions" aria-hidden="true" />
                          </div>
                          <div id={cardId} role="list">
                            {rows.map((row, idx) => {
                              const amt = amounts[idx] || { amount: 0, percentage: 0 };
                              return (
                                <div key={idx} className="company-share-data-row" role="listitem">
                                  <div className="company-share-cell company-share-cell-account">
                                    <div className="company-share-account-inline">
                                      <select
                                        className="share-account-select company-share-select"
                                        aria-label="Account"
                                        value={row.account_id || ""}
                                        onChange={(e) => updateShareRow(role, idx, "account_id", parseInt(e.target.value, 10) || 0)}
                                      >
                                        <option value="">— Select —</option>
                                        {accounts.map((a) => (
                                          <option key={a.id} value={a.id}>{a.account_id}</option>
                                        ))}
                                      </select>
                                      <button type="button" className="company-share-account-plus-btn"
                                        title="Add New Account" aria-label="Add New Account"
                                        onClick={() => handleOpenAddAccount(role)}>+</button>
                                    </div>
                                  </div>
                                  {!isProfit && (
                                    <div className="company-share-cell company-share-cell-pct">
                                      <div className="company-share-pct-wrap">
                                        <input
                                          type="number"
                                          className="share-pct-input company-share-pct-input"
                                          step="0.1" min="0" max="100"
                                          value={row.percentage !== "" ? row.percentage : ""}
                                          placeholder="0"
                                          inputMode="decimal"
                                          aria-label="Percentage"
                                          onChange={(e) => updateShareRow(role, idx, "percentage", e.target.value === "" ? "" : parseFloat(e.target.value))}
                                        />
                                        <span className="company-share-pct-suffix">%</span>
                                      </div>
                                    </div>
                                  )}
                                  <div className="company-share-cell company-share-cell-amount">
                                    <input
                                      type="text"
                                      className="company-share-amount-input"
                                      value={formatShareRowAmount2(amt.amount)}
                                      readOnly tabIndex={-1}
                                      aria-label="Calculated total"
                                    />
                                  </div>
                                  <div className="company-share-cell company-share-cell-remove">
                                    <button type="button" className="company-share-remove-btn"
                                      title="Remove row" aria-label="Remove row"
                                      onClick={() => removeShareRow(role, idx)}>
                                      <span aria-hidden="true">&times;</span>
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          <button type="button" className="company-share-add-btn"
                            onClick={() => addShareRow(role)}>+ Add Account</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {shareAccounts.length === 0 && shareAccountsProfit.length === 0 && (
                <div style={{ display: "block", color: "#64748b", fontSize: 12, marginTop: 8 }}>
                  No linked accounts.
                </div>
              )}
            </div>
          </div>

          {/* Footer actions */}
          <div className="form-actions company-settings-form-actions">
            <button type="button" className="btn btn-save" onClick={handleSave}>Save</button>
            <button type="button" className="btn btn-cancel" onClick={() => {
              // Reset: today, no period, no expiry
              const today = new Date().toISOString().split("T")[0];
              setStartDate(today);
              setPeriod("");
              setExpDisplay("Not set");
              setFsa(defaultFeeShareAllocations());
              setChargeOnSave(false);
              setExpandedCards({});
              if (SINGLE_CATEGORY_MODE) {
                setPermissions(["Games"]);
              } else {
                setPermissions(["Games", "Bank", "Loan", "Rate", "Money"]);
              }
            }}>Reset</button>
            <button type="button" className="btn btn-cancel" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>

      {showAddAccount && (
        <AddAccountModal
          companyId={company.id || sessionCompanyId}
          companyCode={company.company_id || sessionCompanyCode}
          preferredRole={addAccountRole}
          onClose={() => setShowAddAccount(false)}
          onSuccess={() => {
            loadAccounts();
          }}
        />
      )}
    </div>
  );
}
