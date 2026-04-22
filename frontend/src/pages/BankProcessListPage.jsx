import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { assetUrl, buildApiUrl } from "../utils/apiUrl.js";

const PAGE_SIZE = 20;

function normalizeRows(data) {
  return Array.isArray(data) ? data : [];
}

async function isBankCategoryCompany(companyCode) {
  if (!companyCode) return false;
  try {
    const res = await fetch(buildApiUrl("api/domain/domain_api.php"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action: "get_company_permissions", company_id: companyCode }),
    });
    const json = await res.json();
    const permissions = Array.isArray(json?.data?.permissions) ? json.data.permissions : [];
    const normalized = permissions.map((p) => String(p || "").toLowerCase());
    return normalized.includes("bank") && !normalized.includes("games") && !normalized.includes("gambling");
  } catch {
    return false;
  }
}

export default function BankProcessListPage() {
  const [cssReady, setCssReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [rows, setRows] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [showOfficial, setShowOfficial] = useState(false);
  const [showEInvoice, setShowEInvoice] = useState(false);
  const [showBlock, setShowBlock] = useState(false);
  const [toast, setToast] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState({
    id: "",
    country: "",
    bank: "",
    type: "",
    name: "",
    card_merchant_id: "",
    customer_id: "",
    profit_account_id: "",
    contract: "",
    insurance: "",
    cost: "",
    price: "",
    profit: "",
    profit_sharing: "",
    day_start: "",
    day_start_frequency: "1st_of_every_month",
    status: "active",
    remark: "",
  });

  const notify = (message, type = "success") => {
    setToast({ message, type });
    window.clearTimeout(window.__bankProcessToastTimer);
    window.__bankProcessToastTimer = window.setTimeout(() => setToast(null), 1800);
  };

  useLayoutEffect(() => {
    document.body.classList.remove("dashboard-page");
    document.body.classList.add("process-page", "process-page--bank");
    return () => document.body.classList.remove("process-page", "process-page--bank", "process-page--bank-show-all");
  }, []);

  useEffect(() => {
    let cancelled = false;
    const hrefs = [assetUrl("css/processCSS.css"), assetUrl("css/processlist.css"), assetUrl("css/accountCSS.css")];
    Promise.all(
      hrefs.map(
        (href) =>
          new Promise((resolve) => {
            const existing = document.querySelector(`link[rel="stylesheet"][href="${href}"]`);
            if (existing) return resolve(existing);
            const link = document.createElement("link");
            link.rel = "stylesheet";
            link.href = href;
            link.onload = () => resolve(link);
            link.onerror = () => resolve(link);
            document.head.appendChild(link);
          })
      )
    ).then(() => {
      if (!cancelled) setCssReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [meRes, companiesRes] = await Promise.all([
          fetch(buildApiUrl("api/session/current_user_api.php"), { credentials: "include" }),
          fetch(buildApiUrl("api/transactions/get_owner_companies_api.php?all=1"), { credentials: "include" }),
        ]);
        const meJson = await meRes.json();
        if (!meRes.ok || !meJson.success || !meJson.data) {
          window.location.assign(new URL("/login", window.location.origin).toString());
          return;
        }
        const companiesJson = await companiesRes.json();
        const cs = Array.isArray(companiesJson?.data) ? companiesJson.data : [];
        setCompanies(cs);
        const url = new URL(window.location.href);
        const effectiveCompany = url.searchParams.get("company_id") || meJson.data.company_id || cs[0]?.id || null;
        setCompanyId(effectiveCompany ? Number(effectiveCompany) : null);
        const current = cs.find((c) => Number(c.id) === Number(effectiveCompany));
        setSelectedGroup(current?.group_id ? String(current.group_id).toUpperCase() : null);
        setSearch(url.searchParams.get("search") || "");
        setShowAll(url.searchParams.get("showAll") === "1");
        setShowInactive(url.searchParams.get("showInactive") === "1");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!companyId || loading) return;
    const t = window.setTimeout(() => fetchRows(), 180);
    return () => window.clearTimeout(t);
  }, [companyId, loading, search, showAll, showInactive, showOfficial, showEInvoice, showBlock]);

  useEffect(() => {
    if (!companyId || loading) return;
    (async () => {
      try {
        const url = new URL(buildApiUrl("api/accounts/accountlistapi.php"));
        url.searchParams.set("company_id", String(companyId));
        url.searchParams.set("showAll", "1");
        const res = await fetch(url.toString(), { credentials: "include" });
        const json = await res.json();
        const list = Array.isArray(json?.data?.accounts) ? json.data.accounts : [];
        setAccounts(list);
      } catch {
        setAccounts([]);
      }
    })();
  }, [companyId, loading]);

  useEffect(() => {
    if (showAll) document.body.classList.add("process-page--bank-show-all");
    else document.body.classList.remove("process-page--bank-show-all");
  }, [showAll]);

  const syncUrl = () => {
    const url = new URL(window.location.href);
    if (companyId) url.searchParams.set("company_id", String(companyId));
    if (search.trim()) url.searchParams.set("search", search.trim());
    else url.searchParams.delete("search");
    [["showAll", showAll], ["showInactive", showInactive], ["showOfficial", showOfficial], ["showEInvoice", showEInvoice], ["showBlock", showBlock]].forEach(([k, v]) => {
      if (v) url.searchParams.set(k, "1");
      else url.searchParams.delete(k);
    });
    window.history.replaceState({}, document.title, url.toString());
  };

  const fetchRows = async () => {
    if (!companyId) return;
    setTableLoading(true);
    try {
      const url = new URL(buildApiUrl("api/processes/processlist_api.php"));
      url.searchParams.set("permission", "Bank");
      url.searchParams.set("company_id", String(companyId));
      if (search.trim()) url.searchParams.set("search", search.trim());
      if (showAll) url.searchParams.set("showAll", "1");
      if (showInactive) url.searchParams.set("showInactive", "1");
      if (showOfficial) url.searchParams.set("showOfficial", "1");
      if (showEInvoice) url.searchParams.set("showEInvoice", "1");
      if (showBlock) url.searchParams.set("showBlock", "1");
      const res = await fetch(url.toString(), { credentials: "include" });
      const json = await res.json();
      if (!res.ok || !json.success) return notify(json.message || json.error || "Failed to load bank processes", "danger");
      setRows(normalizeRows(json.data));
      setSelectedIds(new Set());
      setCurrentPage(1);
      syncUrl();
    } catch {
      notify("Failed to load bank processes", "danger");
    } finally {
      setTableLoading(false);
    }
  };

  const resetForm = () => {
    setForm({
      id: "",
      country: "",
      bank: "",
      type: "",
      name: "",
      card_merchant_id: "",
      customer_id: "",
      profit_account_id: "",
      contract: "",
      insurance: "",
      cost: "",
      price: "",
      profit: "",
      profit_sharing: "",
      day_start: "",
      day_start_frequency: "1st_of_every_month",
      status: "active",
      remark: "",
    });
  };

  const onSwitchCompany = async (c) => {
    if (!c?.id || Number(c.id) === Number(companyId)) return;
    try {
      const res = await fetch(buildApiUrl(`api/session/update_company_session_api.php?company_id=${c.id}`), { credentials: "include" });
      const json = await res.json();
      if (!res.ok || !json.success) return notify(json.message || json.error || "Switch company failed", "danger");
      setCompanyId(Number(c.id));
      const bankCategory = await isBankCategoryCompany(c.company_id);
      if (!bankCategory) {
        window.location.assign(new URL(`/process-list?company_id=${c.id}`, window.location.origin).toString());
      }
    } catch {
      notify("Switch company failed", "danger");
    }
  };

  const openAdd = () => {
    setEditMode(false);
    resetForm();
    setModalOpen(true);
  };

  const openEdit = async (rowId) => {
    try {
      const url = new URL(buildApiUrl("api/processes/processlist_api.php"));
      url.searchParams.set("action", "get_process");
      url.searchParams.set("id", String(rowId));
      url.searchParams.set("permission", "Bank");
      const res = await fetch(url.toString(), { credentials: "include" });
      const json = await res.json();
      if (!res.ok || !json.success || !json.data) return notify(json.message || json.error || "Failed to load bank process", "danger");
      const d = json.data;
      setEditMode(true);
      setForm({
        id: String(d.id || ""),
        country: d.country || "",
        bank: d.bank || "",
        type: d.type || "",
        name: d.name || "",
        card_merchant_id: d.card_merchant_id ? String(d.card_merchant_id) : "",
        customer_id: d.customer_id ? String(d.customer_id) : "",
        profit_account_id: d.profit_account_id ? String(d.profit_account_id) : "",
        contract: d.contract || "",
        insurance: d.insurance ?? "",
        cost: d.cost ?? "",
        price: d.price ?? "",
        profit: d.profit ?? "",
        profit_sharing: d.profit_sharing || "",
        day_start: d.day_start || "",
        day_start_frequency: d.day_start_frequency || "1st_of_every_month",
        status: d.status || "active",
        remark: d.remark || "",
      });
      setModalOpen(true);
    } catch {
      notify("Failed to load bank process", "danger");
    }
  };

  const submitForm = async (e) => {
    e.preventDefault();
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => {
      if (k === "id" && !editMode) return;
      fd.append(k, v ?? "");
    });
    fd.append("permission", "Bank");
    try {
      const endpoint = editMode ? "api/processes/processlist_api.php?action=update_process" : "api/processes/addprocess_api.php";
      const res = await fetch(buildApiUrl(endpoint), { method: "POST", body: fd, credentials: "include" });
      const json = await res.json();
      if (!res.ok || !json.success) return notify(json.message || json.error || "Save failed", "danger");
      notify(editMode ? "Bank process updated" : "Bank process added");
      setModalOpen(false);
      fetchRows();
    } catch {
      notify("Save failed", "danger");
    }
  };

  const toggleStatus = async (row) => {
    const fd = new FormData();
    fd.append("id", String(row.id));
    fd.append("permission", "Bank");
    try {
      const res = await fetch(buildApiUrl("api/processes/toggle_process_status_api.php"), { method: "POST", body: fd, credentials: "include" });
      const json = await res.json();
      if (!res.ok || !json.success) return notify(json.message || json.error || "Status update failed", "danger");
      const next = String(json?.data?.newStatus || "").toLowerCase();
      setRows((prev) => prev.map((r) => (Number(r.id) === Number(row.id) ? { ...r, status: next || r.status } : r)));
    } catch {
      notify("Status update failed", "danger");
    }
  };

  const deleteSelected = async () => {
    if (!selectedIds.size || !window.confirm("Delete selected inactive bank processes?")) return;
    try {
      const res = await fetch(buildApiUrl("api/processes/delete_processes_api.php"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds), permission: "Bank" }),
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok || !json.success) return notify(json.message || json.error || "Delete failed", "danger");
      notify("Deleted successfully");
      fetchRows();
    } catch {
      notify("Delete failed", "danger");
    }
  };

  const allCompanyButtons = useMemo(() => companies.filter((c) => c.company_id && String(c.company_id).trim() !== ""), [companies]);
  const groupIds = useMemo(() => [...new Set(allCompanyButtons.filter((c) => c.group_id).map((c) => String(c.group_id).toUpperCase()))].sort(), [allCompanyButtons]);
  const companyButtons = useMemo(() => (!selectedGroup ? allCompanyButtons.filter((c) => !c.group_id || String(c.group_id).trim() === "") : allCompanyButtons.filter((c) => String(c.group_id || "").toUpperCase() === selectedGroup)), [allCompanyButtons, selectedGroup]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(rows.length / PAGE_SIZE)), [rows]);
  const pageRows = useMemo(() => {
    if (showAll) return rows;
    const p = Math.min(currentPage, totalPages);
    return rows.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE);
  }, [rows, showAll, currentPage, totalPages]);

  if (loading || !cssReady) return null;

  return (
    <div className="container">
      <div className="content">
        <h1 className="page-title">Bank Process List</h1>
        <div className="action-buttons-container">
          <div className="action-buttons">
            <div className="action-controls-row" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <button type="button" className="btn btn-add" onClick={openAdd}>Add Process</button>
              <div className="search-container"><input className="search-input" placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
              <label className="checkbox-section"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> <span>Show All</span></label>
              <label className="checkbox-section"><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> <span>Show Inactive</span></label>
              <label className="checkbox-section"><input type="checkbox" checked={showOfficial} onChange={(e) => setShowOfficial(e.target.checked)} /> <span>Show Official</span></label>
              <label className="checkbox-section"><input type="checkbox" checked={showEInvoice} onChange={(e) => setShowEInvoice(e.target.checked)} /> <span>Show E-Invoice</span></label>
              <label className="checkbox-section"><input type="checkbox" checked={showBlock} onChange={(e) => setShowBlock(e.target.checked)} /> <span>Show Block</span></label>
            </div>
            <button type="button" className="btn btn-delete" disabled={!selectedIds.size} onClick={deleteSelected}>Delete</button>
          </div>

          {groupIds.length > 0 && <div className="process-company-filter"><span className="process-company-label">GroupID:</span><div className="process-company-buttons">{groupIds.map((g) => <button key={g} type="button" className={`process-company-btn ${selectedGroup === g ? "active" : ""}`} onClick={() => setSelectedGroup(g)}>{g}</button>)}</div></div>}
          <div className="process-company-filter"><span className="process-company-label">Company:</span><div className="process-company-buttons">{companyButtons.map((c) => <button key={c.id} type="button" className={`process-company-btn ${Number(c.id) === Number(companyId) ? "active" : ""}`} onClick={() => onSwitchCompany(c)}>{c.company_id}</button>)}</div></div>
        </div>

        <div className="process-table-wrapper">
          <div className="table-header" style={{ gridTemplateColumns: "0.35fr 0.55fr 0.6fr 0.6fr 1fr 0.6fr 0.6fr 0.6fr 0.6fr 0.6fr 0.6fr 0.7fr 0.7fr 0.45fr" }}>
            {["No", "Supplier", "Country", "Bank", "Card Owner", "Contract", "Insurance", "Customer", "Cost", "Price", "Profit", "Status", "Date", "Action"].map((h) => <div key={h} className="header-item">{h}</div>)}
          </div>
          <div className="process-cards">
            {tableLoading && <div className="process-card"><div className="card-item">Loading...</div></div>}
            {!tableLoading && pageRows.map((r, i) => (
              <div key={r.id} className="process-card" style={{ gridTemplateColumns: "0.35fr 0.55fr 0.6fr 0.6fr 1fr 0.6fr 0.6fr 0.6fr 0.6fr 0.6fr 0.6fr 0.7fr 0.7fr 0.45fr" }}>
                <div className="card-item">{(showAll ? i : (currentPage - 1) * PAGE_SIZE + i) + 1}</div>
                <div className="card-item">{r.supplier || "-"}</div>
                <div className="card-item">{r.country || "-"}</div>
                <div className="card-item">{r.bank || "-"}</div>
                <div className="card-item">{r.card_lower || "-"}</div>
                <div className="card-item">{r.contract || "-"}</div>
                <div className="card-item">{r.insurance || "-"}</div>
                <div className="card-item">{r.customer || "-"}</div>
                <div className="card-item">{r.cost || "-"}</div>
                <div className="card-item">{r.price || "-"}</div>
                <div className="card-item">{r.profit || "-"}</div>
                <div className="card-item"><span className={`role-badge ${r.status === "active" ? "status-active" : "status-inactive"} status-clickable`} onClick={() => toggleStatus(r)} role="button">{String(r.status || "").toUpperCase()}</span></div>
                <div className="card-item">{r.date || "-"}</div>
                <div className="card-item">
                  <button type="button" className="edit-btn" aria-label="Edit" onClick={() => openEdit(r.id)}><img src="/images/edit.svg" alt="Edit" /></button>
                  {String(r.status || "").toLowerCase() === "inactive" && !r.has_transactions && <input type="checkbox" style={{ marginLeft: 8 }} checked={selectedIds.has(r.id)} onChange={() => setSelectedIds((prev) => { const n = new Set(prev); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })} />}
                </div>
              </div>
            ))}
          </div>
        </div>
        {!showAll && <div className="pagination-container"><button type="button" className="pagination-btn" disabled={currentPage <= 1} onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}>◀</button><span className="pagination-info">{currentPage} of {totalPages}</span><button type="button" className="pagination-btn" disabled={currentPage >= totalPages} onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}>▶</button></div>}
      </div>
      {modalOpen && (
        <div className="modal" style={{ display: "block" }}>
          <div className="modal-content">
            <div className="modal-header">
              <h2>{editMode ? "Edit Bank Process" : "Add Bank Process"}</h2>
              <span className="close" onClick={() => setModalOpen(false)} role="presentation">&times;</span>
            </div>
            <div className="modal-body">
              <form className="process-form add-grid" onSubmit={submitForm}>
                <div className="add-col">
                  {["country", "bank", "type", "name", "contract"].map((f) => (
                    <div className="form-row" key={f}>
                      <div className="form-group">
                        <label>{f.replace(/_/g, " ").toUpperCase()}</label>
                        <input value={form[f]} onChange={(ev) => setForm((prev) => ({ ...prev, [f]: ev.target.value }))} required={f !== "contract"} />
                      </div>
                    </div>
                  ))}
                  <div className="form-row"><div className="form-group"><label>DAY START</label><input type="date" value={form.day_start} onChange={(ev) => setForm((prev) => ({ ...prev, day_start: ev.target.value }))} /></div></div>
                  <div className="form-row"><div className="form-group"><label>DAY START FREQUENCY</label><select value={form.day_start_frequency} onChange={(ev) => setForm((prev) => ({ ...prev, day_start_frequency: ev.target.value }))}><option value="1st_of_every_month">1st_of_every_month</option><option value="monthly">monthly</option></select></div></div>
                  {editMode && <div className="form-row"><div className="form-group"><label>STATUS</label><select value={form.status} onChange={(ev) => setForm((prev) => ({ ...prev, status: ev.target.value }))}><option value="active">active</option><option value="inactive">inactive</option></select></div></div>}
                </div>
                <div className="add-col">
                  <div className="form-row"><div className="form-group"><label>CARD MERCHANT</label><select value={form.card_merchant_id} onChange={(ev) => setForm((prev) => ({ ...prev, card_merchant_id: ev.target.value }))}><option value="">Select</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.account_id}</option>)}</select></div></div>
                  <div className="form-row"><div className="form-group"><label>CUSTOMER</label><select value={form.customer_id} onChange={(ev) => setForm((prev) => ({ ...prev, customer_id: ev.target.value }))}><option value="">Select</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.account_id}</option>)}</select></div></div>
                  <div className="form-row"><div className="form-group"><label>PROFIT ACCOUNT</label><select value={form.profit_account_id} onChange={(ev) => setForm((prev) => ({ ...prev, profit_account_id: ev.target.value }))}><option value="">Select</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.account_id}</option>)}</select></div></div>
                  {["insurance", "cost", "price", "profit", "profit_sharing"].map((f) => (
                    <div className="form-row" key={f}><div className="form-group"><label>{f.toUpperCase()}</label><input value={form[f]} onChange={(ev) => setForm((prev) => ({ ...prev, [f]: ev.target.value }))} /></div></div>
                  ))}
                  <div className="form-row"><div className="form-group"><label>REMARK</label><textarea rows={4} value={form.remark} onChange={(ev) => setForm((prev) => ({ ...prev, remark: ev.target.value }))} /></div></div>
                </div>
                <div className="form-actions add-actions">
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
