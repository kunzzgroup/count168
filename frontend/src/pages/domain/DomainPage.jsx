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
      <div className="min-h-screen w-full overflow-hidden bg-[radial-gradient(circle_at_15%_20%,rgba(255,255,255,0.95)_0%,rgba(255,255,255,0)_48%),radial-gradient(circle_at_70%_15%,rgba(255,255,255,0.85)_0%,rgba(255,255,255,0)_45%),radial-gradient(circle_at_40%_70%,rgba(206,232,255,0.55)_0%,rgba(255,255,255,0)_60%),radial-gradient(circle_at_80%_80%,rgba(255,255,255,0.9)_0%,rgba(255,255,255,0)_55%),linear-gradient(145deg,#97BFFC_0%,#AECFFA_40%,#f9fbff_100%)] bg-blend-[screen,screen,multiply,screen,normal] px-10 pb-5 pl-[clamp(180px,14.06vw,270px)] pt-px text-slate-700">
        <h1 className="mb-[clamp(16px,1.35vw,26px)] mt-[clamp(12px,1.04vw,20px)] text-left font-['Amaranth'] text-[clamp(26px,3.33vw,40px)] font-medium tracking-[-0.025em] text-[#002C49]">Domain List</h1>
        {loadError && (
          <div style={{ marginBottom: 10, color: "#b91c1c", fontWeight: 600 }}>{loadError}</div>
        )}

        {/* Action bar */}
        <div className="mb-0 flex items-center justify-between gap-3 pb-[clamp(10px,1.04vw,20px)]">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button className="inline-flex w-[clamp(80px,6.25vw,120px)] items-center justify-center rounded-md border-0 bg-[linear-gradient(180deg,#63C4FF_0%,#0D60FF_100%)] px-0 py-[clamp(6px,0.42vw,8px)] text-center font-['Amaranth'] text-[clamp(10px,0.83vw,16px)] text-white shadow-[0_2px_4px_rgba(0,123,255,0.3)] transition-all hover:-translate-y-px hover:bg-[linear-gradient(180deg,#0D60FF_0%,#63C4FF_100%)] hover:shadow-[0_4px_8px_rgba(0,123,255,0.4)]" onClick={openAddModal}>Add Domain</button>
            <div className="relative">
              <svg className="pointer-events-none absolute left-2.5 top-1/4 z-[2] h-[clamp(14px,0.83vw,16px)] w-[clamp(10px,0.83vw,16px)] object-contain" fill="currentColor" viewBox="0 0 24 24">
                <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
              </svg>
              <input
                type="text"
                id="searchInput"
                placeholder="Search by Owner Name/Company"
                className="w-[clamp(165px,13vw,250px)] rounded-md border border-[rgba(148,163,184,0.35)] bg-white py-[clamp(6px,0.42vw,8px)] pl-[clamp(20px,2.08vw,32px)] pr-0.5 text-[clamp(10px,0.8vw,15px)] text-black shadow-[0_3px_4px_rgba(15,23,42,0.1)] backdrop-blur-[8px] transition-all focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(forceSearchValue(e.target.value))}
              />
            </div>
            <button
              type="button"
              className="whitespace-nowrap rounded-md border-0 bg-[linear-gradient(180deg,#94a3b8_0%,#475569_100%)] px-[clamp(12px,1vw,18px)] py-[clamp(6px,0.42vw,8px)] font-['Amaranth'] text-[clamp(10px,0.83vw,16px)] text-white shadow-[0_2px_4px_rgba(71,85,105,0.35)] transition-all hover:-translate-y-px hover:bg-[linear-gradient(180deg,#64748b_0%,#334155_100%)] hover:shadow-[0_4px_8px_rgba(51,65,85,0.4)]"
              id="domainFeeSettingsBtn"
              onClick={() => setFeeModal(true)}
            >
              Price
            </button>
            <span id="domainFeeInlineSummary" className="whitespace-nowrap text-[clamp(10px,0.78vw,14px)] text-slate-600" aria-live="polite">
              {feeInlineSummary}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              className="ml-2.5 inline-flex w-[clamp(90px,6.25vw,120px)] items-center justify-center rounded-md border-0 bg-[linear-gradient(180deg,#F30E12_0%,#A91215_100%)] px-0 py-[clamp(6px,0.42vw,8px)] font-['Amaranth'] text-[clamp(10px,0.83vw,16px)] text-white shadow-[0_2px_4px_rgba(220,53,69,0.3)] transition-all hover:-translate-y-px hover:bg-[linear-gradient(180deg,#A91215_0%,#F30E12_100%)] hover:shadow-[0_4px_8px_rgba(220,53,69,0.4)] disabled:cursor-not-allowed disabled:opacity-45"
              id="deleteSelectedBtn"
              disabled={checkedIds.size === 0}
              onClick={handleDeleteSelected}
            >
              {checkedIds.size > 0 ? `Delete (${checkedIds.size})` : "Delete"}
            </button>
          </div>
        </div>

        <div className="relative -mx-[50vw] my-[5px] mb-[-10px] h-0.5 w-screen bg-[#939393] left-1/2 right-1/2" />

        {/* Table */}
        <div className="mt-5 overflow-x-visible overflow-y-auto border-0">
          <div className="mb-0 grid grid-cols-[1fr_2fr_3fr_3fr_2fr_4fr_2fr_2fr] gap-[15px] bg-transparent px-5 pb-[15px] pt-[clamp(0px,0.78vw,15px)] text-[clamp(10px,0.74vw,14px)] font-bold text-gray-700">
            <div>No:</div>
            <div>Owner Code:</div>
            <div>Name:</div>
            <div>Email:</div>
            <div>GroupID:</div>
            <div>Companies:</div>
            <div>Created By:</div>
            <div>Action:</div>
          </div>
          <div className="flex max-h-[calc(100vh-250px)] flex-col gap-1.5 overflow-x-visible overflow-y-auto" id="domainTableBody">
            {pagedDomains.map((domain, idx) => {
              const globalIdx = (safePage - 1) * ROWS_PER_PAGE + idx + 1;
              const companiesFull = Array.isArray(domain.companies_full) ? domain.companies_full : [];
              const companyList = companiesFull.map((c) => c.company_id).filter(Boolean);
              const visible = companyList.slice(0, MAX_VISIBLE_CHIPS);
              const hidden = companyList.slice(MAX_VISIBLE_CHIPS);
              const isProtected = hasProtectedCompany(companiesFull);

              return (
                <div key={domain.id} className="grid grid-cols-[1fr_2fr_3fr_3fr_2fr_4fr_2fr_2fr] items-center gap-[15px] rounded-[22px] border border-gray-200 bg-white px-[22px] py-[clamp(4px,0.52vw,10px)] shadow-[0_1px_3px_rgba(0,0,0,0.1)] transition-all hover:-translate-y-px hover:bg-gray-50 hover:shadow-[0_4px_12px_rgba(0,0,0,0.1)]" data-id={domain.id}>
                  <div className="min-w-0 truncate whitespace-nowrap text-[clamp(9px,0.78vw,15px)] font-bold text-gray-700">{globalIdx}</div>
                  <div className="min-w-0 truncate whitespace-nowrap text-[clamp(9px,0.78vw,15px)] font-bold uppercase text-gray-700">{domain.owner_code}</div>
                  <div className="min-w-0 truncate whitespace-nowrap text-[clamp(9px,0.78vw,15px)] font-bold text-gray-700">{domain.name}</div>
                  <div className="min-w-0 truncate whitespace-nowrap text-[clamp(9px,0.78vw,15px)] font-bold text-gray-700">{domain.email}</div>
                  <div className="min-w-0 truncate whitespace-nowrap text-[clamp(9px,0.78vw,15px)] font-bold text-gray-700">{domain.group_ids || "-"}</div>
                  <div className="min-w-0 overflow-visible whitespace-nowrap text-[clamp(9px,0.78vw,15px)] font-bold text-gray-700" data-companies={JSON.stringify(companiesFull)}>
                    {companyList.length === 0 ? "-" : (
                      <div className="flex flex-wrap items-center gap-2">
                        {visible.map((cid) => {
                          const exp = companiesFull.find((c) => c.company_id === cid)?.expiration_date || "";
                          return (
                            <span
                              key={cid}
                              className="inline-block cursor-pointer rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-[clamp(9px,0.72vw,12px)] font-semibold text-indigo-700 transition-all hover:text-indigo-500 hover:underline"
                              data-exp={exp || undefined}
                              onClick={(e) => handleCompanyBadgeClick(e, companiesFull)}
                              style={{ cursor: "pointer" }}
                            >
                              {cid}
                            </span>
                          );
                        })}
                        {hidden.length > 0 && (
                          <span
                            className="cursor-pointer text-[clamp(9px,0.72vw,12px)] font-semibold text-slate-500 hover:text-indigo-500"
                            title={hidden.join(", ")}
                            onClick={(e) => handleCompanyBadgeClick(e, companiesFull)}
                            style={{ cursor: "pointer" }}
                          >
                            +{hidden.length}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 truncate whitespace-nowrap text-[clamp(9px,0.78vw,15px)] font-bold uppercase text-gray-700">{String(domain.created_by || "-").toUpperCase()}</div>
                  <div className="flex min-w-0 items-center whitespace-nowrap text-[clamp(9px,0.78vw,15px)] font-bold text-gray-700">
                    <button
                      className="m-0 cursor-pointer border-0 bg-transparent p-[clamp(2px,0.31vw,6px)] hover:shadow-none"
                      onClick={() => openEditModal(domain)}
                      aria-label="Edit"
                    >
                      <img src="/images/edit.svg" alt="Edit" className="block h-[clamp(10px,0.83vw,16px)] w-[clamp(10px,0.83vw,16px)] object-contain" />
                    </button>
                    {!isProtected && domain.owner_code !== "K" && (
                      <input
                        type="checkbox"
                        className="ml-[clamp(10px,0.73vw,14px)] h-[clamp(10px,0.83vw,16px)] w-[clamp(10px,0.83vw,16px)] cursor-pointer appearance-none rounded-[3px] border-2 border-black bg-white checked:bg-black"
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

        {/* Pagination */}
        {filteredDomains.length > 0 && (
          <div className="fixed bottom-[30px] right-10 z-[100] flex items-center gap-0 rounded-[20px] border border-[rgba(148,163,184,0.2)] bg-[rgba(255,255,255,0.95)] p-0 shadow-[0_4px_12px_rgba(0,0,0,0.15)] backdrop-blur-[8px]" id="paginationContainer" style={{ display: "flex" }}>
            <button
              className="m-0 flex h-[clamp(20px,1.46vw,28px)] w-[clamp(20px,1.46vw,28px)] items-center justify-center rounded-[14px] border-0 bg-transparent text-[clamp(8px,0.83vw,16px)] font-medium text-[#007AFF] transition-all hover:bg-[rgba(0,122,255,0.1)] hover:text-[#0056b3] disabled:cursor-not-allowed disabled:text-[#C7C7CC]"
              id="prevBtn"
              disabled={safePage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            >◀</button>
            <span className="mx-[clamp(0px,0.63vw,12px)] w-[clamp(30px,3.13vw,60px)] whitespace-nowrap text-center text-[clamp(10px,0.78vw,15px)] font-medium text-black" id="paginationInfo">
              {safePage} of {totalPages}
            </span>
            <button
              className="m-0 flex h-[clamp(20px,1.46vw,28px)] w-[clamp(20px,1.46vw,28px)] items-center justify-center rounded-[14px] border-0 bg-transparent text-[clamp(8px,0.83vw,16px)] font-medium text-[#007AFF] transition-all hover:bg-[rgba(0,122,255,0.1)] hover:text-[#0056b3] disabled:cursor-not-allowed disabled:text-[#C7C7CC]"
              id="nextBtn"
              disabled={safePage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            >▶</button>
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
