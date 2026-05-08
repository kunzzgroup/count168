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
import { getDomainText } from "../../../translateFile/domainTranslate.js";
import DomainModalPortal from "./DomainModalPortal.jsx";

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
  lang = "en",
  company: initCompany,
  domainFeePrice,
  sessionCompanyId,
  sessionCompanyCode,
  onSave,
  onClose,
}) {
  const isZh = lang === "zh";
  const t = (key, params) => getDomainText(lang, key, params);
  // Local copy of company being edited
  const [company, setCompany] = useState(() => JSON.parse(JSON.stringify(initCompany)));
  const [period, setPeriod] = useState("");
  const [startDate, setStartDate] = useState(initCompany.startDate || new Date().toISOString().split("T")[0]);
  const [expDisplay, setExpDisplay] = useState(initCompany.expiration_date ? formatDate(initCompany.expiration_date) : t("notSet"));
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
      setExpDisplay(company.expiration_date ? formatDate(company.expiration_date) : t("notSet"));
      return;
    }
    const base = company.isExtending
      ? company.originalExpirationDate || null
      : startDate || new Date().toISOString().split("T")[0];
    const exp = calculateExpirationDate(period, base);
    setExpDisplay(formatDate(exp));
    setCompany((prev) => ({ ...prev, expiration_date: exp, selectedPeriod: period }));
  }, [period, startDate, company.expiration_date, company.isExtending, company.originalExpirationDate, t]);

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
      if (permissions.length === 0) { showDomainAlert(t("pleaseSelectOneCategory"), "danger"); return; }
      if (permissions.length > 1)  { showDomainAlert(t("onlyOneCategoryAtTime"), "danger"); return; }
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
          showDomainAlert(permData.message || t("permissionsSaveFailed"), "danger");
          return;
        }
        if (!shareData.success) {
          const msg = shareData.message || "";
          if (msg.includes("not found") || msg.includes("Save the domain first")) {
            showDomainAlert(t("companyUpdatedShareAfterSave"));
          } else {
            showDomainAlert(msg || t("shareSaveFailed"), "danger");
            return;
          }
        } else {
          const hint = chargeOnSave ? t("feePostsHint") : "";
          showDomainAlert(t("companyUpdatedSuccess") + hint);
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
        showDomainAlert(t("serverUnreachableChangesKept"), "danger");
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
    <DomainModalPortal>
      <div className="fixed inset-0 z-[50003] bg-black/50 backdrop-blur-[4px]" style={{ display: "block" }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="relative mx-auto mt-[2%] w-[min(1120px,96vw)] max-w-[min(1120px,96vw)] overflow-hidden rounded-2xl border-0 bg-white shadow-[0_20px_25px_-5px_rgba(0,0,0,0.1),0_10px_10px_-5px_rgba(0,0,0,0.04)]">
        <button type="button" className="absolute right-5 top-[clamp(10px,1.04vw,20px)] z-[10001] flex h-[clamp(26px,1.88vw,36px)] w-[clamp(26px,1.88vw,36px)] items-center justify-center rounded-full text-[clamp(20px,1.46vw,28px)] font-normal leading-none text-slate-500 transition-all hover:scale-110 hover:bg-slate-100 hover:text-slate-700" onClick={onClose}>&times;</button>
        <h2 className="m-0 w-full border-b border-slate-200 bg-slate-50 px-[clamp(22px,1.67vw,32px)] py-[clamp(10px,1.04vw,20px)] text-[clamp(14px,1.25vw,24px)] font-bold text-slate-800">{t("companySettings")}</h2>
        <div className="flex min-h-0 flex-col items-stretch gap-0 px-[clamp(16px,1.35vw,28px)] pb-[clamp(12px,1vw,20px)] pt-[clamp(8px,0.78vw,14px)]">
          <div className="flex min-h-[min(52vh,420px)] flex-row items-stretch gap-0">
            {/* ── Left: General ── */}
            <div className="min-w-0 flex-[1_1_46%] pr-[clamp(14px,1.25vw,22px)]">
              <h3 className="mb-3 border-b-2 border-slate-200 pb-2 text-[clamp(13px,1vw,16px)] font-bold tracking-[-0.02em] text-slate-900">{t("companySettingsLower")}</h3>
              <div className="mb-[clamp(6px,0.625vw,12px)]">
                <label style={{ fontWeight: "bold", fontSize: "clamp(12px,1.04vw,16px)", color: "#1e293b", marginBottom: 15 }}>
                  {t("companyPrefix")}{company.company_id}
                </label>
              </div>
              {/* Start Date + Period */}
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                <div className="mb-[clamp(6px,0.625vw,12px)]" style={{ flex: 1, minWidth: 140 }}>
                  <label htmlFor="expDateStartDate">{t("startDate")}</label>
                  <input
                    type="date"
                    id="expDateStartDate"
                    className="w-full rounded-[clamp(4px,0.42vw,8px)] border border-gray-300 px-[clamp(6px,0.63vw,12px)] py-[clamp(4px,0.31vw,6px)] text-[clamp(9px,0.73vw,14px)] focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/10"
                    value={startDate}
                    disabled={company.isExtending}
                    onChange={(e) => setStartDate(e.target.value)}
                    style={{ width: "100%", padding: "clamp(4px,0.31vw,6px) clamp(6px,0.63vw,12px)", border: "1px solid #d1d5db", borderRadius: "clamp(4px,0.42vw,8px)", fontSize: "clamp(9px,0.73vw,14px)" }}
                  />
                  <small style={{ color: company.isExtending ? "#ef4444" : "#64748b", fontSize: "clamp(7px,0.52vw,10px)", marginTop: 4, display: "block" }}>
                    {company.isExtending ? t("cannotModifyStartDateWhenExtending") : t("selectStartDateHint")}
                  </small>
                </div>
                <div className="mb-[clamp(6px,0.625vw,12px)]" style={{ flex: 1, minWidth: 140 }}>
                  <label htmlFor="expDatePeriod">{t("period")}</label>
                  <select
                    id="expDatePeriod"
                    className="w-full rounded-[clamp(4px,0.42vw,8px)] border border-gray-300 px-[clamp(6px,0.63vw,12px)] py-[clamp(5px,0.42vw,8px)] text-[clamp(9px,0.73vw,14px)] focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/10"
                    value={period}
                    onChange={(e) => setPeriod(e.target.value)}
                    style={{ width: "100%", padding: "clamp(5px,0.42vw,8px) clamp(6px,0.63vw,12px)", border: "1px solid #d1d5db", borderRadius: "clamp(4px,0.42vw,8px)", fontSize: "clamp(9px,0.73vw,14px)" }}
                  >
                    <option value="">{t("selectPeriod")}</option>
                    <option value="7days">{t("sevenDays")}</option>
                    <option value="1month">{t("oneMonth")}</option>
                    <option value="3months">{t("threeMonths")}</option>
                    <option value="6months">{t("sixMonths")}</option>
                    <option value="1year">{t("oneYear")}</option>
                  </select>
                </div>
              </div>
              {/* Expiration Date display */}
              <div className="mb-2.5">
                <label style={{ fontSize: "clamp(9px,0.73vw,13px)" }}>{t("expirationDate")}</label>
                <div style={{ padding: "clamp(5px,0.5vw,8px)", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: "clamp(4px,0.42vw,6px)", fontSize: "clamp(10px,0.78vw,14px)", fontWeight: 600, color: expDisplay === t("notSet") ? "#94a3b8" : "#1e293b", textAlign: "center" }}>
                  {expDisplay}
                </div>
              </div>
              {/* Permissions */}
              <div className="mb-2">
                <label style={{ marginBottom: 2 }}>{t("permissionsLabel")}</label>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1.5">
                  {PERMISSION_LIST.map(({ value, id }) => (
                    <label key={value} className={`inline-flex cursor-pointer items-center justify-center rounded-full border border-gray-300 bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700 shadow-sm transition-all hover:border-gray-400 hover:bg-gray-200 has-[:checked]:border-blue-600 has-[:checked]:bg-[linear-gradient(180deg,#7eb8ff_0%,#2563eb_100%)] has-[:checked]:text-white`} id={`permissionLabel${value}`}>
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

            <div className="my-1 w-px flex-[0_0_1px] self-stretch rounded-[1px] bg-[linear-gradient(180deg,transparent_0%,#cbd5e1_8%,#94a3b8_50%,#cbd5e1_92%,transparent_100%)]" role="separator" aria-orientation="vertical" aria-hidden="true" />

            {/* ── Right: Share % ── */}
            <div className="min-w-0 flex-[1_1_54%] pl-[clamp(14px,1.25vw,22px)]">
              <div className="mb-3 flex items-center justify-between gap-3 border-b-2 border-slate-200 pb-2">
                <h3 className="m-0 flex-1 border-0 p-0 text-[clamp(13px,1vw,16px)] font-bold tracking-[-0.02em] text-slate-900">{t("share")}</h3>
                <div className="flex items-center gap-2">
                  <span className={`company-share-charge-on-save__state${chargeOnSave ? " company-share-charge-on-save__state--on" : ""}`} aria-hidden="true">
                    {chargeOnSave ? t("on") : t("off")}
                  </span>
                  <label className="relative m-0 inline-flex cursor-pointer">
                    <input
                      type="checkbox"
                      className="absolute z-[2] m-0 h-[22px] w-10 cursor-pointer opacity-0"
                      role="switch"
                      aria-checked={chargeOnSave}
                      checked={chargeOnSave}
                      onChange={(e) => setChargeOnSave(e.target.checked)}
                    />
                    <span className={`relative block h-[22px] w-10 rounded-[11px] shadow-[inset_0_1px_2px_rgba(15,23,42,0.12)] transition-colors ${chargeOnSave ? "bg-[linear-gradient(180deg,#60C1FE_0%,#0F61FF_100%)]" : "bg-slate-300"}`} aria-hidden="true">
                      <span className={`absolute left-[3px] top-[3px] h-4 w-4 rounded-full bg-white shadow-[0_1px_3px_rgba(15,23,42,0.2)] transition-transform ${chargeOnSave ? "translate-x-[18px]" : ""}`} />
                    </span>
                  </label>
                </div>
              </div>

              {/* Grand total bar */}
              <div className="company-share-grand-total" style={{ display: "none" }}>
                <span>{totals.grand.toFixed(2)}%</span>
              </div>

              <div className="max-h-[min(58vh,520px)] min-h-0 flex-1 overflow-y-auto pr-1">
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
                      className={`company-share-role-card${isExpanded ? " expanded" : ""}${isProfit ? " company-share-role-card--profit-pool" : ""}${rows.length === 0 ? " company-share-role-card--empty" : ""}`}
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
                            {assignedCount === 1 ? t("oneAccount") : t("accountCount", { count: assignedCount })}
                          </span>
                        </div>
                        <div className="company-share-role-header-middle">
                          <div className="company-share-role-alloc-row">
                            <span className="company-share-role-alloc-label">{t("shareTotal")}</span>
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
                            {t("manage")}
                          </button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="company-share-role-body">
                          <div className={`company-share-column-labels${isProfit ? " company-share-column-labels--profit-pool" : ""}`}>
                            <span>{t("account")}</span>
                            {!isProfit && <span>{t("share")}</span>}
                            <span>{t("total")}</span>
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
                                        aria-label={t("account")}
                                        value={row.account_id || ""}
                                        onChange={(e) => updateShareRow(role, idx, "account_id", parseInt(e.target.value, 10) || 0)}
                                      >
                                        <option value="">— Select —</option>
                                        {accounts.map((a) => (
                                          <option key={a.id} value={a.id}>{a.account_id}</option>
                                        ))}
                                      </select>
                                      <button type="button" className="company-share-account-plus-btn"
                                        title={t("addNewAccount")} aria-label={t("addNewAccount")}
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
                                          aria-label={t("share")}
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
                                      aria-label={t("total")}
                                    />
                                  </div>
                                  <div className="company-share-cell company-share-cell-remove">
                                    <button type="button" className="company-share-remove-btn"
                                      title={t("removeRow")} aria-label={t("removeRow")}
                                      onClick={() => removeShareRow(role, idx)}>
                                      <span aria-hidden="true">&times;</span>
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          <button type="button" className="company-share-add-btn"
                            onClick={() => addShareRow(role)}>{t("addAccountInline")}</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {shareAccounts.length === 0 && shareAccountsProfit.length === 0 && (
                <div style={{ display: "block", color: "#64748b", fontSize: 12, marginTop: 8 }}>
                  {t("noLinkedAccounts")}
                </div>
              )}
            </div>
          </div>

          {/* Footer actions */}
          <div className="mt-[clamp(16px,1.25vw,22px)] flex justify-center gap-3 border-t border-slate-200 pt-[clamp(12px,1vw,18px)]">
            <button type="button" className="cursor-pointer rounded-md border-0 bg-[linear-gradient(180deg,#63C4FF_0%,#0D60FF_100%)] px-5 py-[clamp(6px,0.42vw,8px)] font-['Amaranth'] text-[clamp(10px,0.83vw,16px)] text-white shadow-[0_2px_4px_rgba(0,123,255,0.3)] transition-all hover:-translate-y-px hover:bg-[linear-gradient(180deg,#0D60FF_0%,#63C4FF_100%)] hover:shadow-[0_4px_8px_rgba(1,59,153,0.4)]" onClick={handleSave}>{t("save")}</button>
            <button type="button" className="cursor-pointer rounded-md border-0 bg-[linear-gradient(180deg,#bcbcbc_0%,#585858_100%)] px-5 py-[clamp(6px,0.42vw,8px)] font-['Amaranth'] text-[clamp(10px,0.83vw,16px)] text-white shadow-[0_2px_4px_rgba(88,88,88,0.3)] transition-all hover:-translate-y-px hover:bg-[linear-gradient(180deg,#585858_0%,#bcbcbc_100%)] hover:shadow-[0_4px_8px_rgba(84,84,84,0.4)]" onClick={() => {
              // Reset: today, no period, no expiry
              const today = new Date().toISOString().split("T")[0];
              setStartDate(today);
              setPeriod("");
              setExpDisplay(t("notSet"));
              setFsa(defaultFeeShareAllocations());
              setChargeOnSave(false);
              setExpandedCards({});
              if (SINGLE_CATEGORY_MODE) {
                setPermissions(["Games"]);
              } else {
                setPermissions(["Games", "Bank", "Loan", "Rate", "Money"]);
              }
            }}>{t("reset")}</button>
            <button type="button" className="cursor-pointer rounded-md border-0 bg-[linear-gradient(180deg,#bcbcbc_0%,#585858_100%)] px-5 py-[clamp(6px,0.42vw,8px)] font-['Amaranth'] text-[clamp(10px,0.83vw,16px)] text-white shadow-[0_2px_4px_rgba(88,88,88,0.3)] transition-all hover:-translate-y-px hover:bg-[linear-gradient(180deg,#585858_0%,#bcbcbc_100%)] hover:shadow-[0_4px_8px_rgba(84,84,84,0.4)]" onClick={onClose}>{t("cancel")}</button>
          </div>
        </div>
      </div>

        {showAddAccount && (
          <AddAccountModal
            lang={lang}
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
    </DomainModalPortal>
  );
}
