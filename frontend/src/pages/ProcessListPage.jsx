import { useEffect, useMemo, useState } from "react";
import { assetUrl, buildApiUrl } from "../utils/apiUrl.js";

const PAGE_SIZE = 20;
const EMPTY_FORM = {
  id: "",
  process_name: "",
  description_id: "",
  currency_id: "",
  day_use: [],
  remove_word: "",
  replace_word_from: "",
  replace_word_to: "",
  remark: "",
  status: "active",
};

function normalizeRows(data) {
  return Array.isArray(data) ? data : [];
}

export default function ProcessListPage() {
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [currencies, setCurrencies] = useState([]);
  const [descriptions, setDescriptions] = useState([]);
  const [days, setDays] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [toast, setToast] = useState(null);

  const notify = (message, type = "success") => {
    setToast({ message, type });
    window.clearTimeout(window.__processToastTimer);
    window.__processToastTimer = window.setTimeout(() => setToast(null), 1800);
  };

  useEffect(() => {
    document.body.classList.remove("dashboard-page");
    document.body.classList.add("process-page");
    const cssA = document.createElement("link");
    cssA.rel = "stylesheet";
    cssA.href = assetUrl("css/processCSS.css");
    document.head.appendChild(cssA);
    const cssB = document.createElement("link");
    cssB.rel = "stylesheet";
    cssB.href = assetUrl("css/processlist.css");
    document.head.appendChild(cssB);
    const cssC = document.createElement("link");
    cssC.rel = "stylesheet";
    cssC.href = assetUrl("css/accountCSS.css");
    document.head.appendChild(cssC);
    return () => {
      document.body.classList.remove("process-page");
      document.body.classList.add("dashboard-page");
      [cssA, cssB, cssC].forEach((el) => {
        if (el.parentNode) el.parentNode.removeChild(el);
      });
    };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [meRes, companiesRes, formRes] = await Promise.all([
          fetch(buildApiUrl("api/session/current_user_api.php"), { credentials: "include" }),
          fetch(buildApiUrl("api/transactions/get_owner_companies_api.php?all=1"), { credentials: "include" }),
          fetch(buildApiUrl("api/processes/addprocess_api.php"), { credentials: "include" }),
        ]);
        const meJson = await meRes.json();
        if (!meRes.ok || !meJson.success || !meJson.data) {
          window.location.assign(new URL("/login", window.location.origin).toString());
          return;
        }
        const companiesJson = await companiesRes.json();
        const formJson = await formRes.json();
        const cs = Array.isArray(companiesJson?.data) ? companiesJson.data : [];
        setCompanies(cs);
        setCurrencies(Array.isArray(formJson?.currencies) ? formJson.currencies : formJson?.data?.currencies || []);
        setDescriptions(Array.isArray(formJson?.descriptions) ? formJson.descriptions : formJson?.data?.descriptions || []);
        setDays(Array.isArray(formJson?.days) ? formJson.days : formJson?.data?.days || []);

        const url = new URL(window.location.href);
        const queryCompany = url.searchParams.get("company_id");
        const effectiveCompany = queryCompany || meJson.data.company_id || cs[0]?.id || null;
        setCompanyId(effectiveCompany ? Number(effectiveCompany) : null);
        const current = cs.find((c) => Number(c.id) === Number(effectiveCompany));
        setSelectedGroup(current?.group_id ? String(current.group_id).toUpperCase() : null);
        setSearch(url.searchParams.get("search") || "");
        setShowInactive(url.searchParams.get("showInactive") === "1");
        setShowAll(url.searchParams.get("showAll") === "1");
      } catch {
        window.location.assign(new URL("/login", window.location.origin).toString());
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (loading || !companyId) return;
    const timer = window.setTimeout(() => fetchRows(), 180);
    return () => window.clearTimeout(timer);
  }, [loading, companyId, search, showInactive, showAll]);

  const syncUrl = () => {
    const url = new URL(window.location.href);
    if (companyId) url.searchParams.set("company_id", String(companyId));
    else url.searchParams.delete("company_id");
    if (search.trim()) url.searchParams.set("search", search.trim());
    else url.searchParams.delete("search");
    if (showInactive) url.searchParams.set("showInactive", "1");
    else url.searchParams.delete("showInactive");
    if (showAll) url.searchParams.set("showAll", "1");
    else url.searchParams.delete("showAll");
    window.history.replaceState({}, document.title, url.toString());
  };

  const fetchRows = async () => {
    if (!companyId) return;
    setTableLoading(true);
    try {
      const url = new URL(buildApiUrl("api/processes/processlist_api.php"));
      url.searchParams.set("permission", "Games");
      url.searchParams.set("company_id", String(companyId));
      if (search.trim()) url.searchParams.set("search", search.trim());
      if (showInactive) url.searchParams.set("showInactive", "1");
      if (showAll) url.searchParams.set("showAll", "1");
      const res = await fetch(url.toString(), { credentials: "include" });
      const json = await res.json();
      if (!res.ok || !json.success) {
        notify(json.message || json.error || "Failed to load process list", "danger");
        return;
      }
      setRows(normalizeRows(json.data));
      setSelectedIds(new Set());
      setCurrentPage(1);
      syncUrl();
    } catch {
      notify("Failed to load process list", "danger");
    } finally {
      setTableLoading(false);
    }
  };

  const allCompanyButtons = useMemo(
    () => companies.filter((c) => c.company_id && String(c.company_id).trim() !== ""),
    [companies]
  );
  const groupIds = useMemo(
    () => [...new Set(allCompanyButtons.filter((c) => c.group_id).map((c) => String(c.group_id).toUpperCase()))].sort(),
    [allCompanyButtons]
  );
  const companyButtons = useMemo(() => {
    if (!selectedGroup) return allCompanyButtons.filter((c) => !c.group_id || String(c.group_id).trim() === "");
    return allCompanyButtons.filter((c) => String(c.group_id || "").toUpperCase() === selectedGroup);
  }, [allCompanyButtons, selectedGroup]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(rows.length / PAGE_SIZE)), [rows]);
  const pageRows = useMemo(() => {
    if (showAll) return rows;
    const page = Math.min(currentPage, totalPages);
    const start = (page - 1) * PAGE_SIZE;
    return rows.slice(start, start + PAGE_SIZE);
  }, [rows, currentPage, totalPages, showAll]);

  const onSwitchCompany = async (company) => {
    if (!company?.id || Number(company.id) === Number(companyId)) return;
    try {
      const res = await fetch(buildApiUrl(`api/session/update_company_session_api.php?company_id=${company.id}`), { credentials: "include" });
      const json = await res.json();
      if (!res.ok || !json.success) {
        notify(json.message || json.error || "Switch company failed", "danger");
        return;
      }
      setCompanyId(Number(company.id));
    } catch {
      notify("Switch company failed", "danger");
    }
  };

  const openAdd = () => {
    setEditMode(false);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEdit = async (id) => {
    try {
      const url = new URL(buildApiUrl("api/processes/processlist_api.php"));
      url.searchParams.set("action", "get_process");
      url.searchParams.set("id", String(id));
      url.searchParams.set("permission", "Games");
      const res = await fetch(url.toString(), { credentials: "include" });
      const json = await res.json();
      if (!res.ok || !json.success || !json.data) {
        notify(json.message || json.error || "Failed to load process", "danger");
        return;
      }
      const p = json.data;
      setEditMode(true);
      setForm({
        id: String(p.id || ""),
        process_name: p.process_name || "",
        description_id: String(p.description_id || ""),
        currency_id: String(p.currency_id || ""),
        day_use: String(p.day_use || "")
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean),
        remove_word: p.remove_word || "",
        replace_word_from: p.replace_word_from || "",
        replace_word_to: p.replace_word_to || "",
        remark: p.remarks || "",
        status: p.status || "active",
      });
      setModalOpen(true);
    } catch {
      notify("Failed to load process", "danger");
    }
  };

  const submitForm = async (event) => {
    event.preventDefault();
    const fd = new FormData();
    if (editMode) {
      fd.append("id", form.id);
      fd.append("process_name", form.process_name);
      fd.append("status", form.status || "active");
      fd.append("selected_descriptions", JSON.stringify([(descriptions.find((d) => String(d.id) === String(form.description_id))?.name || "")]));
      fd.append("description", descriptions.find((d) => String(d.id) === String(form.description_id))?.name || "");
      fd.append("day_use", form.day_use.join(","));
      fd.append("remove_word", form.remove_word || "");
      fd.append("replace_word_from", form.replace_word_from || "");
      fd.append("replace_word_to", form.replace_word_to || "");
      fd.append("remark", form.remark || "");
      fd.append("currency_id", form.currency_id);
      try {
        const res = await fetch(buildApiUrl("api/processes/processlist_api.php?action=update_process"), {
          method: "POST",
          body: fd,
          credentials: "include",
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          notify(json.message || json.error || "Update failed", "danger");
          return;
        }
        notify("Process updated");
        setModalOpen(false);
        fetchRows();
      } catch {
        notify("Update failed", "danger");
      }
      return;
    }

    fd.append("process_id", form.process_name);
    fd.append("description_id", form.description_id);
    fd.append("currency_id", form.currency_id);
    fd.append("day_use", form.day_use.join(","));
    fd.append("remove_word", form.remove_word || "");
    fd.append("replace_word_from", form.replace_word_from || "");
    fd.append("replace_word_to", form.replace_word_to || "");
    fd.append("remark", form.remark || "");
    fd.append("permission", "Games");
    try {
      const res = await fetch(buildApiUrl("api/processes/addprocess_api.php"), {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        notify(json.message || json.error || "Create failed", "danger");
        return;
      }
      notify("Process created");
      setModalOpen(false);
      fetchRows();
    } catch {
      notify("Create failed", "danger");
    }
  };

  const toggleSelectId = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const deleteSelected = async () => {
    if (!selectedIds.size) return;
    if (!window.confirm("Delete selected inactive processes?")) return;
    try {
      const res = await fetch(buildApiUrl("api/processes/delete_processes_api.php"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds), permission: "Games" }),
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        notify(json.message || json.error || "Delete failed", "danger");
        return;
      }
      notify("Deleted successfully");
      fetchRows();
    } catch {
      notify("Delete failed", "danger");
    }
  };

  if (loading) return null;

  return (
    <div className="container">
      <div className="content">
        <h1 className="page-title">Process List</h1>
        <div className="action-buttons-container">
          <div className="action-buttons">
            <div className="action-controls-row" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <button type="button" className="btn btn-add" onClick={openAdd}>Add Process</button>
              <div className="search-container">
                <input className="search-input" placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <label className="checkbox-section">
                <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
                <span>Show All</span>
              </label>
              <label className="checkbox-section">
                <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
                <span>Show Inactive</span>
              </label>
              <button type="button" className="btn btn-delete" disabled={!selectedIds.size} onClick={deleteSelected}>Delete</button>
            </div>
          </div>
          <div>
            <div className="company-group-buttons">
              <button type="button" className={`company-group-btn ${selectedGroup === null ? "active" : ""}`} onClick={() => setSelectedGroup(null)}>AP</button>
              {groupIds.map((g) => (
                <button type="button" key={g} className={`company-group-btn ${selectedGroup === g ? "active" : ""}`} onClick={() => setSelectedGroup(g)}>{g}</button>
              ))}
            </div>
            <div className="company-filter-buttons">
              {companyButtons.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`company-filter-btn ${Number(c.id) === Number(companyId) ? "active" : ""}`}
                  onClick={() => onSwitchCompany(c)}
                >
                  {c.company_id}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="process-table-wrapper" id="processTableWrapper">
          <div className="table-header" id="tableHeader">
            <div className="header-item">No</div>
            <div className="header-item">Process ID</div>
            <div className="header-item">Description</div>
            <div className="header-item">Status</div>
            <div className="header-item">Currency</div>
            <div className="header-item">Day Use</div>
            <div className="header-item">Action</div>
          </div>
          <div className="process-cards" id="processTableBody">
            {tableLoading && <div className="process-card"><div className="card-item">Loading...</div></div>}
            {!tableLoading && pageRows.map((row, idx) => (
              <div className="process-card" key={row.id}>
                <div className="card-item">{(showAll ? idx : (currentPage - 1) * PAGE_SIZE + idx) + 1}</div>
                <div className="card-item">{row.process_name}</div>
                <div className="card-item">{row.description || "-"}</div>
                <div className="card-item"><span className={`status-badge ${row.status === "active" ? "active" : "inactive"}`}>{String(row.status || "").toUpperCase()}</span></div>
                <div className="card-item">{row.currency || "-"}</div>
                <div className="card-item">{row.day_use || "-"}</div>
                <div className="card-item">
                  <button type="button" className="edit-btn" onClick={() => openEdit(row.id)}>Edit</button>
                  {row.status === "inactive" && !row.has_transactions && (
                    <input
                      type="checkbox"
                      style={{ marginLeft: 10 }}
                      checked={selectedIds.has(row.id)}
                      onChange={() => toggleSelectId(row.id)}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {!showAll && (
          <div className="pagination-container" id="paginationContainer">
            <button type="button" className="pagination-btn" disabled={currentPage <= 1} onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}>◀</button>
            <span className="pagination-info">{currentPage} of {totalPages}</span>
            <button type="button" className="pagination-btn" disabled={currentPage >= totalPages} onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}>▶</button>
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="modal" style={{ display: "block" }}>
          <div className="modal-content">
            <div className="modal-header">
              <h2>{editMode ? "Edit Process" : "Add Process"}</h2>
              <span className="close" onClick={() => setModalOpen(false)} role="presentation">&times;</span>
            </div>
            <div className="modal-body">
              <form className="process-form" onSubmit={submitForm}>
                <div className="form-group">
                  <label>Process ID</label>
                  <input
                    value={form.process_name}
                    onChange={(e) => setForm((prev) => ({ ...prev, process_name: e.target.value }))}
                    required
                    readOnly={editMode}
                  />
                </div>
                <div className="form-group">
                  <label>Description</label>
                  <select value={form.description_id} onChange={(e) => setForm((prev) => ({ ...prev, description_id: e.target.value }))} required>
                    <option value="">Select Description</option>
                    {descriptions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Currency</label>
                  <select value={form.currency_id} onChange={(e) => setForm((prev) => ({ ...prev, currency_id: e.target.value }))} required>
                    <option value="">Select Currency</option>
                    {currencies.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
                  </select>
                </div>
                {editMode && (
                  <div className="form-group">
                    <label>Status</label>
                    <select value={form.status} onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}>
                      <option value="active">ACTIVE</option>
                      <option value="inactive">INACTIVE</option>
                    </select>
                  </div>
                )}
                <div className="form-group">
                  <label>Day Use</label>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {days.map((d) => {
                      const id = String(d.id);
                      const checked = form.day_use.includes(id);
                      return (
                        <label key={id}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setForm((prev) => ({
                                ...prev,
                                day_use: checked ? prev.day_use.filter((x) => x !== id) : [...prev.day_use, id],
                              }));
                            }}
                          />
                          {d.day_name}
                        </label>
                      );
                    })}
                  </div>
                </div>
                <div className="form-group">
                  <label>Remove Words</label>
                  <input value={form.remove_word} onChange={(e) => setForm((prev) => ({ ...prev, remove_word: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Replace From</label>
                  <input value={form.replace_word_from} onChange={(e) => setForm((prev) => ({ ...prev, replace_word_from: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Replace To</label>
                  <input value={form.replace_word_to} onChange={(e) => setForm((prev) => ({ ...prev, replace_word_to: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Remark</label>
                  <textarea rows={4} value={form.remark} onChange={(e) => setForm((prev) => ({ ...prev, remark: e.target.value }))} />
                </div>
                <div className="form-actions">
                  <button type="submit" className="btn btn-save">{editMode ? "Update Process" : "Add Process"}</button>
                  <button type="button" className="btn btn-cancel" onClick={() => setModalOpen(false)}>Cancel</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={`process-notification ${toast.type}`}>{toast.message}</div>}
    </div>
  );
}
