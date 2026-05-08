import { useState, useEffect } from "react";
import { buildApiUrl } from "../../../utils/apiUrl.js";
import { showDomainAlert } from "./DomainNotification.jsx";
import CompanySettingsModal from "./CompanySettingsModal.jsx";
import {
  calculateExpirationDate,
  formatDate,
  defaultFeeShareAllocations,
  normalizeFeeShareFromServer,
  ensureCompanyFeeShare,
  companyToDomainPayloadEntry,
  forceUppercaseValue,
  forceLowercaseValue,
  forceNumericValue,
} from "../domainHelpers.js";
import { getDomainText } from "../../../translateFile/domainTranslate.js";
import DomainModalPortal from "./DomainModalPortal.jsx";

/**
 * Domain Add/Edit Modal
 * Props:
 *   isEditMode      — boolean
 *   editingDomain   — domain object (for edit), null for add
 *   hasC168Context  — boolean
 *   isOwnerOrAdmin  — boolean
 *   sessionCompanyId   — number
 *   sessionCompanyCode — string
 *   domainFeePrice  — number (for share calc)
 *   onClose()
 *   onSaved(domainData) — called after successful save
 */
export default function DomainFormModal({
  lang = "en",
  isEditMode, editingDomain, hasC168Context, isOwnerOrAdmin,
  sessionCompanyId, sessionCompanyCode, domainFeePrice,
  onClose, onSaved,
}) {
  const isZh = lang === "zh";
  const t = (key, params) => getDomainText(lang, key, params);
  // Basic fields
  const [ownerCode, setOwnerCode] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [secondaryPassword, setSecondaryPassword] = useState("");

  // Company / Group management
  const [tempCompanies, setTempCompanies] = useState([]);
  const [tempGroups, setTempGroups] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [isMultipleChoiceMode, setIsMultipleChoiceMode] = useState(false);
  const [companyInput, setCompanyInput] = useState("");
  const [groupInput, setGroupInput] = useState("");

  // Company Settings sub-modal
  const [csModalCompanyId, setCsModalCompanyId] = useState(null);

  const showSecondaryPwd =
    !isEditMode || (hasC168Context && isOwnerOrAdmin);

  // On mount, load data if editing
  useEffect(() => {
    if (isEditMode && editingDomain) {
      setOwnerCode(editingDomain.owner_code || "");
      setName(editingDomain.name || "");
      setEmail(editingDomain.email || "");
      // Load companies from API
      fetch(buildApiUrl("api/domain/domain_api.php"), {
        cache: "no-cache",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get_companies", owner_id: editingDomain.id }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.success && data.data?.companies) {
            const allGroups = new Set();
            const validCompanies = [];
            data.data.companies.forEach((c) => {
              if (c.group_id) allGroups.add(c.group_id);
              if (c.company_id) {
                const co = {
                  company_id: c.company_id,
                  expiration_date: c.expiration_date || null,
                  permissions: Array.isArray(c.permissions) ? c.permissions : [],
                  group_id: c.group_id || null,
                  fee_share_allocations: normalizeFeeShareFromServer(c.fee_share_allocations),
                };
                ensureCompanyFeeShare(co);
                co.originalExpirationDate = co.expiration_date || null;
                co.selectedPeriod = null;
                co.startDate = new Date().toISOString().split("T")[0];
                co.isExtending = !!co.expiration_date;
                validCompanies.push(co);
              }
            });
            setTempCompanies(validCompanies);
            setTempGroups(Array.from(allGroups));
          }
        })
        .catch(() => {});
    }
  }, []);

  // ── Company helpers ────────────────────────────────────────────────────────

  function addCompany() {
    const cid = companyInput.trim().toUpperCase();
    if (!cid) { showDomainAlert(t("pleaseEnterCompanyId"), "danger"); return; }
    if (tempCompanies.some((c) => c.company_id === cid)) {
      showDomainAlert(t("companyIdAlreadyAdded"), "danger"); return;
    }
    const isC168 = cid === "C168";
    const today = new Date().toISOString().split("T")[0];
    const newExpDate = isC168 ? null : calculateExpirationDate("1month", today);
    const newCo = {
      company_id: cid,
      expiration_date: newExpDate,
      originalExpirationDate: newExpDate,
      startDate: today,
      isExtending: false,
      group_id: selectedGroupId || null,
      permissions: [],
      fee_share_allocations: defaultFeeShareAllocations(),
    };
    setTempCompanies((prev) => [...prev, newCo]);
    setCompanyInput("");
  }

  function removeCompany(cid) {
    setTempCompanies((prev) => prev.filter((c) => c.company_id !== cid));
  }

  function addGroup() {
    const gid = groupInput.trim().toUpperCase();
    if (!gid) { showDomainAlert(t("pleaseEnterGroupId"), "danger"); return; }
    if (tempGroups.includes(gid)) { showDomainAlert(t("groupIdAlreadyExists"), "danger"); return; }
    setTempGroups((prev) => [...prev, gid]);
    setGroupInput("");
    showDomainAlert(t("groupAdded", { gid }));
  }

  function removeGroup(gid) {
    const count = tempCompanies.filter((c) => c.group_id === gid).length;
    const msg = count > 0
      ? t("confirmDeleteGroupWithCount", { gid, count })
      : t("confirmDeleteGroup", { gid });
    if (!confirm(msg)) return;
    setTempCompanies((prev) => prev.map((c) => c.group_id === gid ? { ...c, group_id: null } : c));
    setTempGroups((prev) => prev.filter((g) => g !== gid));
    if (selectedGroupId === gid) { setSelectedGroupId(null); setIsMultipleChoiceMode(false); }
    showDomainAlert(t("groupRemoved", { gid }));
  }

  function selectGroup(gid) {
    setSelectedGroupId((prev) => prev === gid ? null : gid);
    setIsMultipleChoiceMode(false);
  }

  function toggleMultipleChoice() {
    if (!selectedGroupId) { showDomainAlert(t("pleaseSelectGroupFirst"), "danger"); return; }
    setIsMultipleChoiceMode((prev) => !prev);
  }

  function toggleCompanyGroup(cid) {
    if (!selectedGroupId) return;
    setTempCompanies((prev) => prev.map((c) =>
      c.company_id === cid
        ? { ...c, group_id: c.group_id === selectedGroupId ? null : selectedGroupId }
        : c
    ));
  }

  // ── Company Settings sub-modal callbacks ──────────────────────────────────

  function openCompanySettings(cid) {
    setCsModalCompanyId(cid);
  }

  function handleCompanySettingsSaved(updatedCo) {
    setTempCompanies((prev) =>
      prev.map((c) => c.company_id === updatedCo.company_id ? { ...c, ...updatedCo } : c)
    );
    setCsModalCompanyId(null);
  }

  // ── Form submit ────────────────────────────────────────────────────────────

  function buildCompaniesPayload() {
    const sorted = [...tempCompanies].sort((a, b) =>
      a.company_id.toUpperCase().localeCompare(b.company_id.toUpperCase())
    );
    const cleaned = sorted.map(companyToDomainPayloadEntry);
    // Add empty-company entries for groups with no companies
    const groupsWithCos = new Set(cleaned.map((c) => c.group_id).filter(Boolean));
    tempGroups.forEach((gid) => {
      if (!groupsWithCos.has(gid)) {
        cleaned.push(companyToDomainPayloadEntry({
          company_id: "", expiration_date: null, permissions: [],
          group_id: gid, fee_share_allocations: defaultFeeShareAllocations(),
        }));
      }
    });
    return cleaned;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email.toLowerCase().endsWith("@gmail.com")) {
      showDomainAlert(t("onlyGmailAllowed"), "danger"); return;
    }
    const data = {
      action: isEditMode ? "update" : "create",
      owner_code: ownerCode,
      name,
      email,
      companies: JSON.stringify(buildCompaniesPayload()),
    };
    if (!isEditMode || password) data.password = password;
    if (!isEditMode) {
      data.secondary_password = secondaryPassword;
      data.id = "";
    } else {
      data.id = editingDomain.id;
      if (secondaryPassword) data.secondary_password = secondaryPassword;
    }

    console.log("[Domain Save] companies data:", data.companies);

    try {
      const res = await fetch(buildApiUrl("api/domain/domain_api.php"), {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (json.success) {
        showDomainAlert(isEditMode ? t("ownerUpdated") : t("ownerCreated"));
        onSaved(json.data);
        onClose();
      } else {
        showDomainAlert(json.message || t("operationFailed"), "danger");
      }
    } catch {
      showDomainAlert(t("saveOwnerError"), "danger");
    }
  }

  // ── Company display ────────────────────────────────────────────────────────

  function renderCompanyList() {
    let filtered;
    if (selectedGroupId) {
      filtered = tempCompanies.filter((c) => c.group_id === selectedGroupId);
    } else if (tempGroups.length > 0) {
      filtered = tempCompanies.filter((c) => !c.group_id);
    } else {
      filtered = [...tempCompanies];
    }

    if (isMultipleChoiceMode && selectedGroupId) {
      const candidates = tempCompanies
        .filter((c) => !c.group_id || c.group_id === selectedGroupId)
        .sort((a, b) => a.company_id.localeCompare(b.company_id));

      if (candidates.length === 0) {
        return <span style={{ color: "#94a3b8", fontSize: 12 }}>{t("noUngroupedCompaniesAvailable")}</span>;
      }
      return (
        <div className="grid grid-cols-2 gap-1">
          {candidates.map((c) => (
            <div key={c.company_id} className="flex cursor-pointer items-center gap-2 rounded border border-gray-200 bg-white px-2.5 py-1.5 transition-colors hover:bg-sky-50" onClick={() => toggleCompanyGroup(c.company_id)}>
              <input
                type="checkbox"
                checked={c.group_id === selectedGroupId}
                onChange={() => toggleCompanyGroup(c.company_id)}
                onClick={(e) => e.stopPropagation()}
              />
              <label>{c.company_id}</label>
            </div>
          ))}
        </div>
      );
    }

    const sorted = [...filtered].sort((a, b) => a.company_id.localeCompare(b.company_id));
    if (sorted.length === 0) {
      const msg = selectedGroupId
        ? t("noCompaniesInGroup", { gid: selectedGroupId })
        : t("noUngroupedCompanies");
      return <span style={{ color: "#94a3b8", fontSize: 12 }}>{msg}</span>;
    }

    return sorted.map((c) => (
      <div key={c.company_id} className="mb-2 flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3.5 py-2.5">
        <div className="flex min-w-0 items-center gap-1"><span className="text-sm font-bold text-slate-700">{c.company_id}</span></div>
        <div className="flex items-center gap-1.5">
          <span className="mr-2 whitespace-nowrap text-xs text-slate-500">
            {c.expiration_date ? formatDate(c.expiration_date) : t("notSet")}
          </span>
          <button
            type="button" className="h-7 cursor-pointer rounded-[3px] border-0 px-2.5 text-[10px] text-white transition-colors hover:brightness-95"
            onClick={() => openCompanySettings(c.company_id)}
            title={t("setExpirationDate")}
            style={{ background: "linear-gradient(180deg, #60C1FE 0%, #0F61FF 100%)" }}
          >
            {t("set")}
          </button>
          <button type="button" className="h-7 cursor-pointer rounded-[3px] border-0 bg-red-500 px-2.5 text-[10px] text-white transition-colors hover:bg-red-600" onClick={() => removeCompany(c.company_id)}>
            {t("remove")}
          </button>
        </div>
      </div>
    ));
  }

  const csCompany = csModalCompanyId
    ? tempCompanies.find((c) => c.company_id === csModalCompanyId)
    : null;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <DomainModalPortal>
      {/* z-index fixed inline: production Tailwind 若未抽出 arbitrary z-[50001]，弹窗可能在 #root/sidebar 下不可见 */}
      <div
        className="domain-form-modal-backdrop"
        style={{
          display: "block",
          position: "fixed",
          inset: 0,
          zIndex: 2147483000,
          overflowY: "auto",
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
        }}
      >
        <div className="domain-form-modal-panel relative mx-auto my-[1.5%] flex w-[96%] max-w-[1100px] flex-col overflow-hidden rounded-[14px] bg-white shadow-[0_20px_50px_rgba(0,0,0,0.18)]">
          <div className="dfm-header flex items-center justify-between border-b border-gray-300 bg-[#f4f5f7] px-9 py-[18px]">
            <h2 className="m-0 bg-transparent p-0 text-xl font-bold tracking-[1.5px] text-black">{isEditMode ? t("editDomain") : t("addDomain")}</h2>
            <button className="flex h-9 w-9 items-center justify-center rounded-full border-0 bg-transparent text-[26px] text-black transition-colors hover:bg-gray-200" onClick={onClose}>&times;</button>
          </div>
          <form className="domain-form-modal-form flex flex-col bg-white" onSubmit={handleSubmit}>
            <input type="hidden" value={isEditMode ? editingDomain?.id : ""} />
            <div className="domain-form-modal-body px-9 py-6">
              <div className="dfm-grid-two dfm-section-row">
                <div className="dfm-section-heading">{t("domainInformation")}</div>
                <div className="dfm-section-heading">{t("companyInformation")}</div>
              </div>
              <div className="dfm-section-divider h-[2.5px] w-full bg-blue-900" />
              <div className="dfm-grid-two">
                {/* Left: Domain info */}
                <div className="dfm-col-left min-w-0">
                  <div className="dfm-field">
                    <label htmlFor="df_owner_code">{t("ownerCode")} *</label>
                    <input
                      type="text" id="df_owner_code" required className="min-h-[42px] w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-[15px] focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/10"
                      value={ownerCode}
                      disabled={isEditMode}
                      onChange={(e) => setOwnerCode(forceUppercaseValue(e.target.value))}
                    />
                  </div>
                  <div className="dfm-field">
                    <label htmlFor="df_name">{t("name")} *</label>
                    <input
                      type="text" id="df_name" required className="min-h-[42px] w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-[15px] focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/10"
                      value={name}
                      onChange={(e) => setName(forceUppercaseValue(e.target.value))}
                    />
                  </div>
                  <div className="dfm-field">
                    <label htmlFor="df_email">{t("email")} *</label>
                    <input
                      type="email" id="df_email" required className="min-h-[42px] w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-[15px] focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/10"
                      pattern=".*@gmail\.com$"
                      value={email}
                      onChange={(e) => setEmail(forceLowercaseValue(e.target.value))}
                    />
                  </div>
                  <div className="dfm-field">
                    <label htmlFor="df_password">{t("password")} {!isEditMode && "*"}</label>
                    <input
                      type="password" id="df_password" className="min-h-[42px] w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-[15px] focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/10"
                      required={!isEditMode}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                  {showSecondaryPwd && (
                    <div className="dfm-field">
                      <label htmlFor="df_secondary_pwd">
                        {t("secondaryPassword")} {!isEditMode && "*"}
                      </label>
                      <input
                        type="password" id="df_secondary_pwd" className="min-h-[42px] w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-[15px] focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/10"
                        maxLength={6}
                        pattern="[0-9]{6}"
                        placeholder={isEditMode ? t("leaveEmptyKeepCurrentPassword") : t("sixDigitsOnly")}
                        required={!isEditMode}
                        value={secondaryPassword}
                        onChange={(e) => setSecondaryPassword(forceNumericValue(e.target.value))}
                      />
                      <small className="dfm-helper-text">{t("secondaryPwdRequirement")}</small>
                    </div>
                  )}
                </div>

                {/* Right: Company info */}
                <div className="dfm-col-right flex min-w-0 flex-col">
                  <div className="dfm-company-inputs-row mb-1 flex flex-wrap">
                    {/* Group input */}
                    <div className="dfm-field min-w-0 flex-1">
                      <label htmlFor="df_group_input">Group ID</label>
                      <div className="dfm-input-with-btn flex min-w-0">
                        <input
                          type="text" id="df_group_input"
                          placeholder={t("groupIdPlaceholder")} className="min-h-[42px] flex-1 rounded-l-lg rounded-r-none border border-r-0 border-gray-300 px-3.5 py-2.5 text-[15px] uppercase focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/10"
                          value={groupInput}
                          onChange={(e) => setGroupInput(forceUppercaseValue(e.target.value))}
                          onKeyPress={(e) => { if (e.key === "Enter") { e.preventDefault(); addGroup(); } }}
                        />
                        <button type="button" className="dfm-adjoin-btn rounded-r-lg border-0 bg-[linear-gradient(180deg,#63C4FF_0%,#0D60FF_100%)] px-4 text-[15px] font-semibold text-white transition-all hover:bg-[linear-gradient(180deg,#0D60FF_0%,#63C4FF_100%)] sm:px-5" onClick={addGroup}>{t("add")}</button>
                      </div>
                    </div>
                    {/* Company input */}
                    <div className="dfm-field min-w-0 flex-1">
                      <label htmlFor="df_company_input">Company ID</label>
                      <div className="dfm-input-with-btn flex min-w-0">
                        <input
                          type="text" id="df_company_input"
                          placeholder={t("companyIdPlaceholder")} className="min-h-[42px] flex-1 rounded-l-lg rounded-r-none border border-r-0 border-gray-300 px-3.5 py-2.5 text-[15px] uppercase focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/10"
                          value={companyInput}
                          onChange={(e) => setCompanyInput(forceUppercaseValue(e.target.value))}
                          onKeyPress={(e) => { if (e.key === "Enter") { e.preventDefault(); addCompany(); } }}
                        />
                        <button type="button" className="dfm-adjoin-btn rounded-r-lg border-0 bg-[linear-gradient(180deg,#63C4FF_0%,#0D60FF_100%)] px-4 text-[15px] font-semibold text-white transition-all hover:bg-[linear-gradient(180deg,#0D60FF_0%,#63C4FF_100%)] sm:px-5" onClick={addCompany}>{t("add")}</button>
                      </div>
                    </div>
                  </div>

                  {/* Group pills */}
                  <div className="dfm-field" id="groupPillsSection">
                    <label>{t("groupLabel")}</label>
                    <div className="flex min-h-[34px] flex-wrap items-center gap-2 py-1">
                      {tempGroups.length === 0
                        ? <span className="dfm-empty-hint">{t("noGroupsCreated")}</span>
                        : tempGroups.map((gid) => {
                          const count = tempCompanies.filter((c) => c.group_id === gid).length;
                          return (
                            <span
                              key={gid}
                              className={`inline-flex h-8 min-w-14 cursor-pointer select-none items-center justify-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold transition-all ${
                                selectedGroupId === gid
                                  ? "border-transparent bg-[linear-gradient(180deg,#63C4FF_0%,#0D60FF_100%)] text-white shadow-[0_2px_6px_rgba(0,123,255,0.3)]"
                                  : "border-slate-300 bg-slate-100 text-slate-800 hover:border-indigo-300 hover:bg-slate-200"
                              }`}
                              onClick={() => selectGroup(gid)}
                            >
                              {gid} ({count})
                              <span className={`ml-0.5 inline-flex items-center text-[15px] font-bold leading-none ${selectedGroupId === gid ? "text-white/70 hover:text-red-300" : "text-red-600 hover:text-red-800"}`} onClick={(e) => { e.stopPropagation(); removeGroup(gid); }}>&times;</span>
                            </span>
                          );
                        })
                      }
                    </div>
                  </div>

                  {/* Selected Companies */}
                  <div className="dfm-field dfm-field--stretch flex flex-1 flex-col">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <label>{t("selectedCompanies")}</label>
                      {selectedGroupId && (
                        <button
                          type="button"
                          className={`cursor-pointer rounded-[10px] border-0 px-3 py-1.5 text-[11px] font-semibold text-white transition-all ${
                            isMultipleChoiceMode
                              ? "bg-[linear-gradient(180deg,#fbbf24_0%,#f59e0b_100%)] shadow-[0_0_0_2px_rgba(245,158,11,0.4)]"
                              : "bg-[linear-gradient(180deg,#63C4FF_0%,#0D60FF_100%)]"
                          }`}
                          onClick={toggleMultipleChoice}
                        >
                          {isMultipleChoiceMode ? t("done") : t("multipleChoice")}
                        </button>
                      )}
                    </div>
                    <div className="dfm-selected-list">
                      {tempCompanies.length === 0
                        ? <span className="dfm-empty-hint">{t("noCompaniesAddedYet")}</span>
                        : renderCompanyList()
                      }
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="dfm-footer-actions flex flex-wrap items-center justify-center border-t-[2.5px] border-blue-900 bg-white px-9 py-[18px]">
              <button type="submit" className="dfm-footer-btn dfm-footer-btn--primary">{t("confirm")}</button>
              <button type="button" className="dfm-footer-btn dfm-footer-btn--secondary" onClick={onClose}>{t("cancel")}</button>
            </div>
          </form>
        </div>
      </div>

      {/* Company Settings sub-modal */}
      {csCompany && (
        <CompanySettingsModal
          lang={lang}
          company={csCompany}
          domainFeePrice={domainFeePrice}
          sessionCompanyId={sessionCompanyId}
          sessionCompanyCode={sessionCompanyCode}
          onSave={handleCompanySettingsSaved}
          onClose={() => setCsModalCompanyId(null)}
        />
      )}
    </DomainModalPortal>
  );
}
