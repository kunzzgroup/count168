import { useEffect, useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { assetUrl, buildApiUrl } from "../../utils/apiUrl.js";
import {
  ROWS_PER_PAGE,
  MAX_VISIBLE_CHIPS,
  hasProtectedCompany,
  forceSearchValue,
  formatDomainFeeDisplay2,
  formatDomainFeeEdit2,
} from "./domainHelpers.js";

// Sub-components
import DomainNotification, { showDomainAlert } from "./components/DomainNotification.jsx";
import DomainConfirmModal from "./components/DomainConfirmModal.jsx";
import DomainFeeModal from "./components/DomainFeeModal.jsx";
import CompanyExpirationModal from "./components/CompanyExpirationModal.jsx";
import DomainFormModal from "./components/DomainFormModal.jsx";

export default function DomainPage() {
  const navigate = useNavigate();

  // ── Session / auth ─────────────────────────────────────────────────────────
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  const [cssReady, setCssReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  // Keep legacy modal css available during migration
  const assetVersion = useMemo(() => Date.now(), []);

  useEffect(() => {
    document.body.classList.remove("bg");
    document.body.classList.add("dashboard-page");

    const hrefs = [
      assetUrl(`css/domain.css?v=${assetVersion}`),
      assetUrl(`css/accountCSS.css?v=${assetVersion}`),
    ];
    let loaded = 0;
    const links = [];

    const onLoad = () => {
      loaded += 1;
      if (loaded >= hrefs.length) setCssReady(true);
    };

    hrefs.forEach((href) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      link.onload = onLoad;
      link.onerror = onLoad;
      document.head.appendChild(link);
      links.push(link);
    });

    return () => {
      links.forEach((l) => l.parentNode?.removeChild(l));
      setCssReady(false);
    };
  }, [assetVersion]);


  // ── Domain list ────────────────────────────────────────────────────────────
  const [domains, setDomains] = useState([]);

  // ── Search / Pagination ────────────────────────────────────────────────────
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  // ── Checkboxes for delete ──────────────────────────────────────────────────
  const [checkedIds, setCheckedIds] = useState(new Set());

  // ── Modals ─────────────────────────────────────────────────────────────────
  const [showDomainForm, setShowDomainForm] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingDomain, setEditingDomain] = useState(null);

  const [confirmModal, setConfirmModal] = useState(null); // { message, onConfirm }
  const [feeModal, setFeeModal] = useState(false);
  const [expModal, setExpModal] = useState(null);       // companies array

  // ── Domain fee price (for share calc) ─────────────────────────────────────
  const [domainFeePrice, setDomainFeePrice] = useState(0);
  const [feeInlineSummary, setFeeInlineSummary] = useState("");

  // ── Auth + initial data load ───────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(buildApiUrl("api/session/current_user_api.php"), { credentials: "include" });
        const json = await res.json();
        if (!res.ok || !json.success || !json.data) return navigate("/login", { replace: true });
        const u = json.data;
        if (!u.has_c168_domain_page_access) { navigate("/dashboard", { replace: true }); return; }
        setMe(u);
        setReady(true);

        // Load domain list
        const r2 = await fetch(buildApiUrl("api/domain/domain_api.php"), {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "list" }),
        });
        const j2 = await r2.json();
        if (!r2.ok || !j2?.success) {
          setLoadError(j2?.message || "Failed to load domain data"); return;
        }
        setDomains(Array.isArray(j2?.data?.domains) ? j2.data.domains : []);

        // Load fee summary
        refreshFeeSummary();
      } catch {
        setReady(true);
        setLoadError("Failed to load domain data");
      }
    })();
  }, [navigate]);

  // ── Fee summary ────────────────────────────────────────────────────────────
  function refreshFeeSummary() {
    fetch(buildApiUrl("api/domain/domain_api.php"), {
      cache: "no-cache", method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "get_domain_fee_settings" }),
    })
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data) {
          const p2 = formatDomainFeeDisplay2(res.data.price);
          setFeeInlineSummary(p2 !== "—" ? `Display: Price ${p2}` : "");
          setDomainFeePrice(Number(res.data.price) || 0);
        }
      })
      .catch(() => {});
  }

  // ── Filtered + paginated list ──────────────────────────────────────────────
  const filteredDomains = useMemo(() => {
    if (!searchTerm) return domains;
    const term = searchTerm.toLowerCase();
    return domains.filter((d) => {
      const comps = Array.isArray(d.companies_full) ? d.companies_full : [];
      const compStr = comps.map((c) => String(c.company_id || "").toLowerCase()).join(" ");
      return (
        String(d.owner_code || "").toLowerCase().includes(term) ||
        String(d.name || "").toLowerCase().includes(term) ||
        String(d.email || "").toLowerCase().includes(term) ||
        String(d.group_ids || "").toLowerCase().includes(term) ||
        compStr.includes(term)
      );
    });
  }, [domains, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredDomains.length / ROWS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const pagedDomains = useMemo(() => {
    const start = (safePage - 1) * ROWS_PER_PAGE;
    return filteredDomains.slice(start, start + ROWS_PER_PAGE);
  }, [filteredDomains, safePage]);

  // Reset to page 1 on search change
  useEffect(() => { setCurrentPage(1); }, [searchTerm]);

  // ── Delete logic ───────────────────────────────────────────────────────────
  function handleCheckbox(id, checked) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      checked ? next.add(id) : next.delete(id);
      return next;
    });
  }

  function handleDeleteSelected() {
    if (checkedIds.size === 0) { showDomainAlert("Please select owners to delete first", "danger"); return; }

    const invalid = domains.filter((d) => checkedIds.has(d.id) && hasProtectedCompany(d.companies_full));
    const valid = domains.filter((d) => checkedIds.has(d.id) && !hasProtectedCompany(d.companies_full));

    if (invalid.length > 0 && valid.length === 0) {
      showDomainAlert("Cannot delete owners linked to company C168", "danger"); return;
    }
    if (invalid.length > 0 && valid.length > 0) {
      showDomainAlert(`Owners linked to company C168 cannot be deleted. ${valid.length} other owner(s) will be deleted.`, "danger");
    }

    const names = valid.map((d) => d.name).join(", ");
    setConfirmModal({
      message: `Are you sure you want to delete the following ${valid.length} owner(s)?\n\n${names}`,
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          const results = await Promise.all(
            valid.map((d) =>
              fetch(buildApiUrl("api/domain/domain_api.php"), {
                cache: "no-cache", method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "delete", id: d.id }),
              }).then((r) => r.json())
            )
          );
          const ok = results.filter((r) => r.success).length;
          const fail = results.length - ok;
          if (fail === 0) showDomainAlert(`Successfully deleted ${ok} owners!`);
          else showDomainAlert(`Deletion completed: ${ok} succeeded, ${fail} failed`, "danger");
          const deletedIds = new Set(valid.map((d) => d.id));
          setDomains((prev) => prev.filter((d) => !deletedIds.has(d.id)));
          setCheckedIds(new Set());
        } catch {
          showDomainAlert("An error occurred during batch deletion", "danger");
        }
      },
    });
  }

  // ── Open modals ────────────────────────────────────────────────────────────
  function openAddModal() {
    setIsEditMode(false);
    setEditingDomain(null);
    setShowDomainForm(true);
  }

  function openEditModal(domain) {
    setIsEditMode(true);
    setEditingDomain(domain);
    setShowDomainForm(true);
  }

  function handleDomainSaved(data) {
    if (isEditMode) {
      setDomains((prev) => prev.map((d) => d.id === data.id ? data : d));
    } else {
      setDomains((prev) => [...prev, data]);
    }
  }

  function handleCompanyBadgeClick(e, companiesFull) {
    e.stopPropagation();
    setExpModal(companiesFull);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (!ready || !cssReady) return null;

  const isOwnerOrAdmin = ["owner", "admin"].includes(String(me?.role || "").toLowerCase());

  return (
    <>
      <div className="container domain-react-page">
        <h1>Domain List</h1>
        {loadError && (
          <div style={{ marginBottom: 10, color: "#b91c1c", fontWeight: 600 }}>{loadError}</div>
        )}

        <div className="action-buttons">
          <div className="domain-toolbar-left">
            <button type="button" className="btn-add" onClick={openAddModal}>
              Add Domain
            </button>
            <div className="search-container">
              <svg className="search-icon" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
              </svg>
              <input
                type="text"
                id="searchInput"
                placeholder="Search by Owner Name/Company"
                className="search-input"
                value={searchTerm}
                onChange={(e) => setSearchTerm(forceSearchValue(e.target.value))}
              />
            </div>
            <button type="button" className="btn-fee-settings" id="domainFeeSettingsBtn" onClick={() => setFeeModal(true)}>
              Price
            </button>
            <span id="domainFeeInlineSummary" className="domain-fee-inline-summary" aria-live="polite">
              {feeInlineSummary}
            </span>
          </div>
          <div className="domain-toolbar-right">
            <button
              type="button"
              className="btn-delete"
              id="deleteSelectedBtn"
              disabled={checkedIds.size === 0}
              onClick={handleDeleteSelected}
            >
              {checkedIds.size > 0 ? `Delete (${checkedIds.size})` : "Delete"}
            </button>
          </div>
        </div>

        <div className="separator-line" aria-hidden="true" />

        <div className="table-container">
          <div className="table-header">
            <div>No:</div>
            <div>Owner Code:</div>
            <div>Name:</div>
            <div>Email:</div>
            <div>GroupID:</div>
            <div>Companies:</div>
            <div>Created By:</div>
            <div>Action:</div>
          </div>
          <div className="domain-cards" id="domainTableBody">
            {pagedDomains.map((domain, idx) => {
              const globalIdx = (safePage - 1) * ROWS_PER_PAGE + idx + 1;
              const companiesFull = Array.isArray(domain.companies_full) ? domain.companies_full : [];
              const companyList = companiesFull.map((c) => c.company_id).filter(Boolean);
              const visible = companyList.slice(0, MAX_VISIBLE_CHIPS);
              const hidden = companyList.slice(MAX_VISIBLE_CHIPS);
              const isProtected = hasProtectedCompany(companiesFull);

              return (
                <div key={domain.id} className="domain-card show-card" data-id={domain.id}>
                  <div className="card-item">{globalIdx}</div>
                  <div className="card-item uppercase-text">{domain.owner_code}</div>
                  <div className="card-item">{domain.name}</div>
                  <div className="card-item">{domain.email}</div>
                  <div className="card-item">{domain.group_ids || "-"}</div>
                  <div className="card-item companies-column" data-companies={JSON.stringify(companiesFull)}>
                    {companyList.length === 0 ? "-" : (
                      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                        {visible.map((cid) => {
                          const exp = companiesFull.find((c) => c.company_id === cid)?.expiration_date || "";
                          return (
                            <span
                              key={cid}
                              role="button"
                              tabIndex={0}
                              className="domain-company-chip company-badge"
                              data-exp={exp || undefined}
                              onClick={(e) => handleCompanyBadgeClick(e, companiesFull)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  handleCompanyBadgeClick(e, companiesFull);
                                }
                              }}
                            >
                              {cid}
                            </span>
                          );
                        })}
                        {hidden.length > 0 && (
                          <span
                            role="button"
                            tabIndex={0}
                            className="domain-company-more"
                            title={hidden.join(", ")}
                            onClick={(e) => handleCompanyBadgeClick(e, companiesFull)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                handleCompanyBadgeClick(e, companiesFull);
                              }
                            }}
                          >
                            +{hidden.length}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="card-item uppercase-text">{String(domain.created_by || "-").toUpperCase()}</div>
                  <div className="card-item" style={{ display: "flex", alignItems: "center" }}>
                    <button type="button" className="btn-edit" onClick={() => openEditModal(domain)} aria-label="Edit">
                      <img src="/images/edit.svg" alt="Edit" />
                    </button>
                    {!isProtected && domain.owner_code !== "K" && (
                      <input
                        type="checkbox"
                        className="domain-checkbox"
                        value={domain.id}
                        checked={checkedIds.has(domain.id)}
                        onChange={(e) => handleCheckbox(domain.id, e.target.checked)}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {filteredDomains.length > 0 && (
          <div className="pagination-container" id="paginationContainer">
            <button
              type="button"
              className="pagination-btn"
              id="prevBtn"
              disabled={safePage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            >
              ◀
            </button>
            <span className="pagination-info" id="paginationInfo">
              {safePage} of {totalPages}
            </span>
            <button
              type="button"
              className="pagination-btn"
              id="nextBtn"
              disabled={safePage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            >
              ▶
            </button>
          </div>
        )}
      </div>

      {/* ── Modals ─────────────────────────────────────────────────────────── */}

      {showDomainForm && (
        <DomainFormModal
          isEditMode={isEditMode}
          editingDomain={editingDomain}
          hasC168Context={!!me?.has_c168_domain_page_access}
          isOwnerOrAdmin={isOwnerOrAdmin}
          sessionCompanyId={me?.company_id ?? null}
          sessionCompanyCode={String(me?.company_code || "")}
          domainFeePrice={domainFeePrice}
          onClose={() => setShowDomainForm(false)}
          onSaved={handleDomainSaved}
        />
      )}

      {confirmModal && (
        <DomainConfirmModal
          message={confirmModal.message}
          onConfirm={confirmModal.onConfirm}
          onClose={() => setConfirmModal(null)}
        />
      )}

      {feeModal && (
        <DomainFeeModal
          onClose={() => setFeeModal(false)}
          onFeeSaved={(data) => {
            const p2 = formatDomainFeeDisplay2(data.price);
            setFeeInlineSummary(p2 !== "—" ? `Display: Price ${p2}` : "");
            setDomainFeePrice(Number(data.price) || 0);
          }}
        />
      )}

      {expModal && (
        <CompanyExpirationModal
          companies={expModal}
          onClose={() => setExpModal(null)}
        />
      )}

      <DomainNotification />
    </>
  );
}
