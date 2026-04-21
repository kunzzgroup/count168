import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { buildApiUrl } from "../utils/apiUrl.js";

export default function DomainPage() {
  const navigate = useNavigate();
  const [domains, setDomains] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [ownerCode, setOwnerCode] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [secondaryPassword, setSecondaryPassword] = useState("");
  const [companiesText, setCompaniesText] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "/css/domain.css";
    document.head.appendChild(link);

    (async () => {
      try {
        const res = await fetch(buildApiUrl("api/session/current_user_api.php"), { credentials: "include" });
        const json = await res.json();

        if (!res.ok || !json.success || !json.data) {
          navigate("/login", { replace: true });
          return;
        }

        const u = json.data;
        // Keep the same access gate as legacy domain.php.
        if (u.user_type === "member") {
          window.location.assign(new URL("member.php", window.location.origin).href);
          return;
        }
        if (!u.has_c168_domain_page_access) {
          navigate("/dashboard", { replace: true });
          return;
        }

        await loadDomains();
      } catch {
        navigate("/login", { replace: true });
      } finally {
        setLoading(false);
      }
    })();

    return () => {
      document.head.removeChild(link);
    };
  }, [navigate]);

  async function loadDomains() {
    const res = await fetch(buildApiUrl("api/domain/domain_api.php"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "list" }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.message || "Failed to load domain list");
    }
    setDomains(Array.isArray(json.data?.domains) ? json.data.domains : []);
  }

  const visible = useMemo(() => {
    const kw = q.trim().toLowerCase();
    if (!kw) return domains;
    return domains.filter((d) => {
      const hay = [
        d.owner_code,
        d.name,
        d.email,
        d.group_ids,
        d.companies,
        ...(Array.isArray(d.companies_full) ? d.companies_full.map((c) => c.company_id) : []),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(kw);
    });
  }, [domains, q]);

  function openAdd() {
    setEditId(null);
    setOwnerCode("");
    setName("");
    setEmail("");
    setPassword("");
    setSecondaryPassword("");
    setCompaniesText("");
    setModalOpen(true);
  }

  function openEdit(d) {
    setEditId(d.id);
    setOwnerCode((d.owner_code || "").toUpperCase());
    setName((d.name || "").toUpperCase());
    setEmail((d.email || "").toLowerCase());
    setPassword("");
    setSecondaryPassword("");
    const all = Array.isArray(d.companies_full) ? d.companies_full.map((c) => c.company_id).filter(Boolean) : [];
    setCompaniesText(all.join(", "));
    setModalOpen(true);
  }

  function parseCompaniesSimple(text) {
    return text
      .split(",")
      .map((x) => x.trim().toUpperCase())
      .filter(Boolean)
      .map((company_id) => ({ company_id, expiration_date: null, permissions: [], group_id: null }));
  }

  async function submitForm(e) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const companies = parseCompaniesSimple(companiesText);
      const payload = {
        action: editId ? "update" : "create",
        ...(editId ? { id: editId } : { owner_code: ownerCode.toUpperCase().trim() }),
        name: name.toUpperCase().trim(),
        email: email.toLowerCase().trim(),
        companies: JSON.stringify(companies),
      };
      if (!editId) {
        payload.password = password;
        payload.secondary_password = secondaryPassword;
      } else {
        if (password.trim()) payload.password = password.trim();
        if (secondaryPassword.trim()) payload.secondary_password = secondaryPassword.trim();
      }
      const res = await fetch(buildApiUrl("api/domain/domain_api.php"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "Save failed");
      setModalOpen(false);
      await loadDomains();
    } catch (err) {
      alert(String(err.message || err));
    } finally {
      setSaving(false);
    }
  }

  async function removeDomain(id) {
    if (!window.confirm("Delete this owner?")) return;
    const res = await fetch(buildApiUrl("api/domain/domain_api.php"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      alert(json.message || "Delete failed");
      return;
    }
    await loadDomains();
  }

  if (loading) {
    return <div style={{ padding: 24 }}>Loading domain...</div>;
  }

  return (
    <div className="container">
      <h1>Domain List</h1>
      <div className="action-buttons" style={{ marginBottom: 0, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button className="btn btn-add" onClick={openAdd}>Add Domain</button>
          <div className="search-container">
            <input
              type="text"
              className="search-input"
              placeholder="Search by Owner Name/Company"
              value={q}
              onChange={(e) => setQ(e.target.value.toUpperCase().replace(/[^A-Z0-9]/gi, ""))}
            />
          </div>
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
        <div className="domain-cards" style={{ maxHeight: "calc(100vh - 260px)" }}>
          {visible.map((d, i) => {
            const companyList = Array.isArray(d.companies_full) ? d.companies_full.map((c) => c.company_id).filter(Boolean) : [];
            const preview = companyList.slice(0, 3);
            const hidden = Math.max(0, companyList.length - 3);
            return (
              <div className="domain-card show-card" key={d.id} data-id={d.id}>
                <div className="card-item">{i + 1}</div>
                <div className="card-item uppercase-text">{d.owner_code}</div>
                <div className="card-item">{d.name}</div>
                <div className="card-item">{d.email}</div>
                <div className="card-item">{d.group_ids || "-"}</div>
                <div className="card-item companies-column">
                  <div className="chip-group">
                    {preview.map((c) => (
                      <span key={c} className="chip company-badge">{c}</span>
                    ))}
                    {hidden > 0 && <span className="chip-more">+{hidden}</span>}
                  </div>
                </div>
                <div className="card-item uppercase-text">{String(d.created_by || "-").toUpperCase()}</div>
                <div className="card-item" style={{ gap: 8 }}>
                  <button className="btn btn-edit edit-btn" onClick={() => openEdit(d)} aria-label="Edit">
                    <img src="/images/edit.svg" alt="Edit" />
                  </button>
                  <button className="btn btn-delete" style={{ width: "auto", marginLeft: 0 }} onClick={() => removeDomain(d.id)}>
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {modalOpen && (
        <div className="modal" style={{ display: "block" }}>
          <div className="modal-content">
            <span className="close" onClick={() => setModalOpen(false)}>&times;</span>
            <h2>{editId ? "EDIT DOMAIN" : "ADD DOMAIN"}</h2>
            <form className="modal-body" onSubmit={submitForm} style={{ display: "block", minHeight: 0 }}>
              {!editId && (
                <div className="form-group">
                  <label>Owner Code *</label>
                  <input value={ownerCode} onChange={(e) => setOwnerCode(e.target.value.toUpperCase())} required />
                </div>
              )}
              <div className="form-group">
                <label>Name *</label>
                <input value={name} onChange={(e) => setName(e.target.value.toUpperCase())} required />
              </div>
              <div className="form-group">
                <label>Email *</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value.toLowerCase())} required />
              </div>
              <div className="form-group">
                <label>Password {editId ? "" : "*"}</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required={!editId} />
              </div>
              <div className="form-group">
                <label>Secondary Password {editId ? "" : "*"}</label>
                <input
                  value={secondaryPassword}
                  onChange={(e) => setSecondaryPassword(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
                  required={!editId}
                  maxLength={6}
                />
              </div>
              <div className="form-group">
                <label>Companies (comma separated)</label>
                <input value={companiesText} onChange={(e) => setCompaniesText(e.target.value.toUpperCase())} placeholder="C168, 95, AG" />
              </div>
              <div className="form-actions">
                <button className="btn btn-save" type="submit" disabled={saving}>{saving ? "Saving..." : "Confirm"}</button>
                <button className="btn btn-cancel" type="button" onClick={() => setModalOpen(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

