import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { buildApiUrl } from "../utils/apiUrl.js";

const PAGE_SIZE = 20;

function hasProtectedCompany(domain) {
  const companies = Array.isArray(domain?.companies_full) ? domain.companies_full : [];
  return companies.some((c) => String(c?.company_id || "").toUpperCase() === "C168");
}

function includesSearch(domain, q) {
  const text = [
    domain?.owner_code,
    domain?.name,
    domain?.email,
    domain?.group_ids,
    ...(Array.isArray(domain?.companies_full) ? domain.companies_full.map((c) => c?.company_id) : []),
  ]
    .map((v) => String(v || "").toLowerCase())
    .join(" ");
  return text.includes(q);
}

export default function DomainPage() {
  const navigate = useNavigate();
  const [domains, setDomains] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [searchText, setSearchText] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [priceText, setPriceText] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    document.body.classList.remove("bg");
    document.body.classList.add("dashboard-page");
    const links = [];
    const addCss = (href) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      document.head.appendChild(link);
      links.push(link);
    };
    const assetVersion = window.__domainAssetVersion || Date.now();
    window.__domainAssetVersion = assetVersion;
    addCss(`/css/domain.css?v=${assetVersion}`);
    addCss(`/css/accountCSS.css?v=${assetVersion}`);

    return () => {
      document.body.classList.remove("dashboard-page");
      document.body.classList.add("bg");
      links.forEach((link) => {
        if (link.parentNode) link.parentNode.removeChild(link);
      });
    };
  }, []);

  const loadDomains = async () => {
    const r2 = await fetch(buildApiUrl("api/domain/domain_api.php"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "list" }),
    });
    const j2 = await r2.json();
    if (!r2.ok || !j2?.success) throw new Error(j2?.message || "Failed to load domain data");
    setDomains(Array.isArray(j2?.data?.domains) ? j2.data.domains : []);
  };

  const loadFeeSummary = async () => {
    try {
      const res = await fetch(buildApiUrl("api/domain/domain_api.php"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get_domain_fee_settings" }),
      });
      const json = await res.json();
      if (res.ok && json?.success && json?.data?.price !== null && json?.data?.price !== undefined) {
        const n = Number(json.data.price);
        setPriceText(Number.isFinite(n) ? `Display: Price ${n.toFixed(2)}` : "");
      } else {
        setPriceText("");
      }
    } catch {
      setPriceText("");
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(buildApiUrl("api/session/current_user_api.php"), { credentials: "include" });
        const json = await res.json();
        if (!res.ok || !json.success || !json.data) return navigate("/login", { replace: true });
        const u = json.data;
        if (!u.has_c168_domain_page_access) return navigate("/dashboard", { replace: true });
        await Promise.all([loadDomains(), loadFeeSummary()]);
        setLoadError("");
      } catch (e) {
        setLoadError(e?.message || "Failed to load domain data");
      }
    })();
  }, [navigate]);

  const filteredDomains = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return domains;
    return domains.filter((d) => includesSearch(d, q));
  }, [domains, searchText]);

  const totalPages = Math.max(1, Math.ceil(filteredDomains.length / PAGE_SIZE));
  const page = Math.min(currentPage, totalPages);
  const pageRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredDomains.slice(start, start + PAGE_SIZE);
  }, [filteredDomains, page]);

  useEffect(() => {
    setCurrentPage(1);
    setSelectedIds(new Set());
  }, [searchText]);

  const toggleSelect = (id, checked) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(String(id));
      else next.delete(String(id));
      return next;
    });
  };

  const selectedRows = pageRows.filter((d) => selectedIds.has(String(d.id)));
  const canDeleteCount = selectedRows.filter((d) => !hasProtectedCompany(d) && String(d.owner_code || "").toUpperCase() !== "K").length;

  const deleteSelected = async () => {
    if (selectedIds.size === 0) return window.alert("Please select owners to delete first.");
    const toDelete = domains.filter((d) => selectedIds.has(String(d.id)) && !hasProtectedCompany(d) && String(d.owner_code || "").toUpperCase() !== "K");
    if (toDelete.length === 0) return window.alert("Cannot delete owners linked to company C168.");
    const names = toDelete.map((d) => d.name).join(", ");
    if (!window.confirm(`Are you sure you want to delete ${toDelete.length} owner(s)?\n\n${names}`)) return;

    setDeleting(true);
    try {
      const results = await Promise.all(
        toDelete.map(async (d) => {
          const res = await fetch(buildApiUrl("api/domain/domain_api.php"), {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "delete", id: d.id }),
          });
          return res.json();
        })
      );
      const successIds = new Set(toDelete.filter((_, i) => results[i]?.success).map((d) => d.id));
      setDomains((prev) => prev.filter((d) => !successIds.has(d.id)));
      setSelectedIds(new Set());
      const successCount = successIds.size;
      const failCount = toDelete.length - successCount;
      window.alert(failCount === 0 ? `Successfully deleted ${successCount} owner(s).` : `Deletion completed: ${successCount} succeeded, ${failCount} failed.`);
    } catch {
      window.alert("An error occurred during batch deletion.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="container">
      <h1>Domain List</h1>
      {loadError && <div style={{ marginBottom: 10, color: "#b91c1c", fontWeight: 600 }}>{loadError}</div>}

      <div className="action-buttons" style={{ marginBottom: 0, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button className="btn btn-add" type="button" onClick={() => window.alert("Add/Edit modal is being migrated to React.")}>
            Add Domain
          </button>
          <div className="search-container">
            <svg className="search-icon" fill="currentColor" viewBox="0 0 24 24">
              <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
            </svg>
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search by Owner Name/Company"
              className="search-input"
            />
          </div>
          <button type="button" className="btn btn-fee-settings" onClick={() => window.alert("Price modal is being migrated to React.")}>
            Price
          </button>
          <span className="domain-fee-inline-summary" aria-live="polite">{priceText}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button className="btn btn-delete" type="button" disabled={deleting || canDeleteCount === 0} onClick={deleteSelected}>
            {deleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>

      <div className="separator-line" />

      <div className="table-container">
        <div className="table-header">
          <div className="header-item">No:</div>
          <div className="header-item">Owner Code:</div>
          <div className="header-item">Name:</div>
          <div className="header-item">Email:</div>
          <div className="header-item">GroupID:</div>
          <div className="header-item">Companies:</div>
          <div className="header-item">Created By:</div>
          <div className="header-item">Action:</div>
        </div>
        <div className="domain-cards">
          {pageRows.map((domain, idx) => {
            const companiesFull = Array.isArray(domain.companies_full) ? domain.companies_full : [];
            const companyList = companiesFull.map((c) => c.company_id).filter(Boolean);
            const visible = companyList.slice(0, 3);
            const hidden = companyList.slice(3);
            const ownerProtected = String(domain.owner_code || "").toUpperCase() === "K" || hasProtectedCompany(domain);
            return (
              <div className="domain-card" data-id={domain.id} key={domain.id}>
                <div className="card-item">{(page - 1) * PAGE_SIZE + idx + 1}</div>
                <div className="card-item uppercase-text">{domain.owner_code}</div>
                <div className="card-item">{domain.name}</div>
                <div className="card-item">{domain.email}</div>
                <div className="card-item">{domain.group_ids || "-"}</div>
                <div className="card-item companies-column" data-companies={JSON.stringify(companiesFull)}>
                  {companyList.length === 0 ? "-" : (
                    <div className="chip-group">
                      {visible.map((companyId) => {
                        const exp = companiesFull.find((c) => c.company_id === companyId)?.expiration_date || "";
                        return (
                          <span key={companyId} className="chip company-badge" data-exp={exp || undefined}>
                            {companyId}
                          </span>
                        );
                      })}
                      {hidden.length > 0 && <span className="chip-more" title={hidden.join(", ")}>+{hidden.length}</span>}
                    </div>
                  )}
                </div>
                <div className="card-item uppercase-text">{String(domain.created_by || "-").toUpperCase()}</div>
                <div className="card-item">
                  <button className="btn btn-edit edit-btn" type="button" onClick={() => window.alert("Add/Edit modal is being migrated to React.")} aria-label="Edit">
                    <img src="/images/edit.svg" alt="Edit" />
                  </button>
                  {!ownerProtected && (
                    <input
                      type="checkbox"
                      className="domain-checkbox"
                      checked={selectedIds.has(String(domain.id))}
                      onChange={(e) => toggleSelect(domain.id, e.target.checked)}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="pagination-container" style={{ display: filteredDomains.length === 0 ? "none" : "flex" }}>
        <button className="pagination-btn" type="button" disabled={page <= 1} onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}>◀</button>
        <span className="pagination-info">{page} of {totalPages}</span>
        <button className="pagination-btn" type="button" disabled={page >= totalPages} onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}>▶</button>
      </div>
    </div>
  );
}
