import { useState, useEffect } from "react";
import { buildApiUrl } from "../../utils/apiUrl.js";
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
} from "../../pages/domainHelpers.js";

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
  isEditMode, editingDomain, hasC168Context, isOwnerOrAdmin,
  sessionCompanyId, sessionCompanyCode, domainFeePrice,
  onClose, onSaved,
}) {
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
    if (!cid) { showDomainAlert("Please enter a company ID", "danger"); return; }
    if (tempCompanies.some((c) => c.company_id === cid)) {
      showDomainAlert("Company ID already added", "danger"); return;
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
    if (!gid) { showDomainAlert("Please enter a Group ID", "danger"); return; }
    if (tempGroups.includes(gid)) { showDomainAlert("Group ID already exists", "danger"); return; }
    setTempGroups((prev) => [...prev, gid]);
    setGroupInput("");
    showDomainAlert(`Group "${gid}" added!`);
  }

  function removeGroup(gid) {
    const count = tempCompanies.filter((c) => c.group_id === gid).length;
    const msg = count > 0
      ? `Are you sure you want to delete group "${gid}"?\n\n${count} company(ies) in this group will become ungrouped.`
      : `Are you sure you want to delete group "${gid}"?`;
    if (!confirm(msg)) return;
    setTempCompanies((prev) => prev.map((c) => c.group_id === gid ? { ...c, group_id: null } : c));
    setTempGroups((prev) => prev.filter((g) => g !== gid));
    if (selectedGroupId === gid) { setSelectedGroupId(null); setIsMultipleChoiceMode(false); }
    showDomainAlert(`Group "${gid}" removed`);
  }

  function selectGroup(gid) {
    setSelectedGroupId((prev) => prev === gid ? null : gid);
    setIsMultipleChoiceMode(false);
  }

  function toggleMultipleChoice() {
    if (!selectedGroupId) { showDomainAlert("Please select a Group first", "danger"); return; }
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
      showDomainAlert("Only @gmail.com addresses are allowed", "danger"); return;
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
        showDomainAlert(isEditMode ? "Owner updated successfully!" : "Owner created successfully!");
        onSaved(json.data);
        onClose();
      } else {
        showDomainAlert(json.message || "Operation failed", "danger");
      }
    } catch {
      showDomainAlert("An error occurred while saving owner", "danger");
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
        return <span style={{ color: "#94a3b8", fontSize: 12 }}>No ungrouped companies available</span>;
      }
      return (
        <div className="assign-grid">
          {candidates.map((c) => (
            <div key={c.company_id} className="company-assign-item" onClick={() => toggleCompanyGroup(c.company_id)}>
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
        ? `No companies in group "${selectedGroupId}". Click "Multiple Choice" to assign.`
        : "No ungrouped companies";
      return <span style={{ color: "#94a3b8", fontSize: 12 }}>{msg}</span>;
    }

    return sorted.map((c) => (
      <div key={c.company_id} className="company-item">
        <div className="company-item-left"><span>{c.company_id}</span></div>
        <div className="company-item-right">
          <span className="exp-date-display" style={{ marginRight: 8 }}>
            {c.expiration_date ? formatDate(c.expiration_date) : "Not set"}
          </span>
          <button
            type="button" className="company-reset-btn"
            onClick={() => openCompanySettings(c.company_id)}
            title="Set expiration date"
            style={{ background: "linear-gradient(180deg, #60C1FE 0%, #0F61FF 100%)" }}
          >
            Set
          </button>
          <button type="button" className="company-remove-btn" onClick={() => removeCompany(c.company_id)}>
            Remove
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
    <>
      <div className="modal" style={{ display: "block" }}>
        <div className="modal-container-wide">
          <div className="modal-header-wide">
            <h2>{isEditMode ? "EDIT DOMAIN" : "ADD DOMAIN"}</h2>
            <button className="modal-close-btn" onClick={onClose}>&times;</button>
          </div>
          <form onSubmit={handleSubmit}>
            <input type="hidden" value={isEditMode ? editingDomain?.id : ""} />
            <div className="modal-body-wide">
              <div className="section-titles-row">
                <div className="section-title">DOMAIN INFORMATION</div>
                <div className="section-title">COMPANY INFORMATION</div>
              </div>
              <div className="section-divider" />
              <div className="two-columns">
                {/* Left: Domain info */}
                <div className="column-left">
                  <div className="form-group">
                    <label htmlFor="df_owner_code">Owner Code *</label>
                    <input
                      type="text" id="df_owner_code" required
                      value={ownerCode}
                      disabled={isEditMode}
                      onChange={(e) => setOwnerCode(forceUppercaseValue(e.target.value))}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="df_name">Name *</label>
                    <input
                      type="text" id="df_name" required
                      value={name}
                      onChange={(e) => setName(forceUppercaseValue(e.target.value))}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="df_email">Email *</label>
                    <input
                      type="email" id="df_email" required
                      pattern=".*@gmail\.com$"
                      value={email}
                      onChange={(e) => setEmail(forceLowercaseValue(e.target.value))}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="df_password">Password {!isEditMode && "*"}</label>
                    <input
                      type="password" id="df_password"
                      required={!isEditMode}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                  {showSecondaryPwd && (
                    <div className="form-group">
                      <label htmlFor="df_secondary_pwd">
                        Secondary Password {!isEditMode && "*"}
                      </label>
                      <input
                        type="password" id="df_secondary_pwd"
                        maxLength={6}
                        pattern="[0-9]{6}"
                        placeholder={isEditMode ? "Leave empty to keep current password" : "6 digits only"}
                        required={!isEditMode}
                        value={secondaryPassword}
                        onChange={(e) => setSecondaryPassword(forceNumericValue(e.target.value))}
                      />
                      <small className="form-hint">Must be exactly 6 digits (0-9)</small>
                    </div>
                  )}
                </div>

                {/* Right: Company info */}
                <div className="column-right">
                  <div className="inputs-row">
                    {/* Group input */}
                    <div className="form-group" style={{ flex: 1 }}>
                      <label htmlFor="df_group_input">Group ID</label>
                      <div className="input-with-btn">
                        <input
                          type="text" id="df_group_input"
                          placeholder="GROUP ID" style={{ textTransform: "uppercase" }}
                          value={groupInput}
                          onChange={(e) => setGroupInput(forceUppercaseValue(e.target.value))}
                          onKeyPress={(e) => { if (e.key === "Enter") { e.preventDefault(); addGroup(); } }}
                        />
                        <button type="button" className="btn-inline-add" onClick={addGroup}>Add</button>
                      </div>
                    </div>
                    {/* Company input */}
                    <div className="form-group" style={{ flex: 1 }}>
                      <label htmlFor="df_company_input">Company ID</label>
                      <div className="input-with-btn">
                        <input
                          type="text" id="df_company_input"
                          placeholder="COMPANY ID" style={{ textTransform: "uppercase" }}
                          value={companyInput}
                          onChange={(e) => setCompanyInput(forceUppercaseValue(e.target.value))}
                          onKeyPress={(e) => { if (e.key === "Enter") { e.preventDefault(); addCompany(); } }}
                        />
                        <button type="button" className="btn-inline-add" onClick={addCompany}>Add</button>
                      </div>
                    </div>
                  </div>

                  {/* Group pills */}
                  <div className="form-group" id="groupPillsSection">
                    <label>Group :</label>
                    <div className="group-pills">
                      {tempGroups.length === 0
                        ? <span style={{ color: "#94a3b8", fontSize: 12 }}>No groups created</span>
                        : tempGroups.map((gid) => {
                          const count = tempCompanies.filter((c) => c.group_id === gid).length;
                          return (
                            <span
                              key={gid}
                              className={`group-pill${selectedGroupId === gid ? " active" : ""}`}
                              onClick={() => selectGroup(gid)}
                            >
                              {gid} ({count})
                              <span className="remove-x" onClick={(e) => { e.stopPropagation(); removeGroup(gid); }}>&times;</span>
                            </span>
                          );
                        })
                      }
                    </div>
                  </div>

                  {/* Selected Companies */}
                  <div className="form-group" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                    <div className="selected-companies-header">
                      <label>Selected Companies :</label>
                      {selectedGroupId && (
                        <button
                          type="button"
                          className={`badge-multi${isMultipleChoiceMode ? " active" : ""}`}
                          style={{ border: "none", cursor: "pointer" }}
                          onClick={toggleMultipleChoice}
                        >
                          {isMultipleChoiceMode ? "Done ✓" : "Multiple Choice"}
                        </button>
                      )}
                    </div>
                    <div className="companies-list-box">
                      {tempCompanies.length === 0
                        ? <span style={{ color: "#94a3b8", fontSize: 12 }}>No companies added yet</span>
                        : renderCompanyList()
                      }
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer-wide">
              <button type="submit" className="btn-wide btn-wide-confirm">Confirm</button>
              <button type="button" className="btn-wide btn-wide-cancel" onClick={onClose}>Cancel</button>
            </div>
          </form>
        </div>
      </div>

      {/* Company Settings sub-modal */}
      {csCompany && (
        <CompanySettingsModal
          company={csCompany}
          domainFeePrice={domainFeePrice}
          onSave={handleCompanySettingsSaved}
          onClose={() => setCsModalCompanyId(null)}
        />
      )}
    </>
  );
}
