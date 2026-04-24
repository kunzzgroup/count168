import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { assetUrl, buildApiUrl } from "../utils/apiUrl.js";

// ── Toast ─────────────────────────────────────────────────────────────────────

function Toast({ notices }) {
  return (
    <div id="notificationContainer">
      {notices.map((n) => (
        <div key={n.id} className={`notification ${n.type}${n.visible ? " show" : ""}`}>
          {n.message}
        </div>
      ))}
    </div>
  );
}

// ── Confirm Modal ─────────────────────────────────────────────────────────────

function ConfirmModal({ message, onConfirm, onClose }) {
  return (
    <div
      className="edit-modal"
      style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="edit-modal-content" style={{ maxWidth: 420, padding: "28px 32px" }}>
        <div style={{ fontSize: "clamp(14px,1.1vw,18px)", fontWeight: 600, color: "#1e293b", marginBottom: 12 }}>
          Confirm
        </div>
        <p style={{ color: "#475569", fontSize: "clamp(12px,0.9vw,15px)", marginBottom: 24, whiteSpace: "pre-wrap" }}>
          {message}
        </p>
        <div className="edit-modal-actions">
          <button type="button" className="edit-modal-btn edit-modal-btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="edit-modal-btn edit-modal-btn-save"
            style={{ background: "#ef4444" }}
            onClick={onConfirm}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Edit Announcement Modal ───────────────────────────────────────────────────

function EditAnnouncementModal({ open, draft, setDraft, onClose, onSave }) {
  if (!open) return null;
  return (
    <div
      id="editAnnouncementModal"
      className="edit-modal"
      style={{ display: "block" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="edit-modal-content">
        <div className="edit-modal-header">
          <h2>Edit Announcement</h2>
          <span className="edit-modal-close" onClick={onClose} role="button" aria-label="Close">
            &times;
          </span>
        </div>
        <form id="editAnnouncementForm" onSubmit={(e) => { e.preventDefault(); onSave(); }}>
          <div className="form-group">
            <label htmlFor="editAnnouncementTitle">Title *</label>
            <input
              id="editAnnouncementTitle"
              type="text"
              required
              maxLength={500}
              value={draft.title}
              onChange={(e) => setDraft((p) => ({ ...p, title: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label htmlFor="editAnnouncementContent">Content *</label>
            <textarea
              id="editAnnouncementContent"
              required
              value={draft.content}
              onChange={(e) => setDraft((p) => ({ ...p, content: e.target.value }))}
            />
          </div>
          <div className="edit-modal-actions">
            <button type="button" className="edit-modal-btn edit-modal-btn-cancel" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="edit-modal-btn edit-modal-btn-save">
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Edit Maintenance Modal ────────────────────────────────────────────────────

function EditMaintenanceModal({ open, draft, setDraft, onClose, onSave }) {
  if (!open) return null;
  return (
    <div
      id="editMaintenanceModal"
      className="edit-modal"
      style={{ display: "block" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="edit-modal-content">
        <div className="edit-modal-header">
          <h2>Edit Maintenance Content</h2>
          <span className="edit-modal-close" onClick={onClose} role="button" aria-label="Close">
            &times;
          </span>
        </div>
        <form id="editMaintenanceForm" onSubmit={(e) => { e.preventDefault(); onSave(); }}>
          <div className="form-group">
            <label htmlFor="editMaintenanceContent">Content *</label>
            <textarea
              id="editMaintenanceContent"
              required
              value={draft.content}
              onChange={(e) => setDraft((p) => ({ ...p, content: e.target.value }))}
            />
          </div>
          <div className="edit-modal-actions">
            <button type="button" className="edit-modal-btn edit-modal-btn-cancel" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="edit-modal-btn edit-modal-btn-save">
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Announcement Panel ────────────────────────────────────────────────────────

function AnnouncementPanel({ announcements, onEdit, onDelete }) {
  const [form, setForm] = useState({ title: "", content: "" });
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    const title = form.title.trim();
    const content = form.content.trim();
    if (!title || !content) return;
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("title", title);
      fd.append("content", content);
      const res = await fetch(buildApiUrl("api/announcements/announcement_create_api.php"), {
        method: "POST", body: fd, credentials: "include",
      });
      const json = await res.json();
      if (json.success) {
        setForm({ title: "", content: "" });
        onEdit(); // triggers reload
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div id="panel-announcement" className="page-panel">
      <div className="announcement-layout">
        {/* Create Form */}
        <div className="announcement-form-section">
          <h2 style={{ marginTop: 0, color: "#002C49", fontFamily: "'Amaranth', sans-serif", fontSize: "clamp(16px, 1.25vw, 24px)", marginBottom: "clamp(8px, 0.73vw, 14px)" }}>
            Create New Announcement
          </h2>
          <form id="announcementForm" onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="announcement-title">Title *</label>
              <input
                id="announcement-title"
                type="text"
                required
                maxLength={500}
                placeholder="Enter announcement title"
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label htmlFor="announcement-content">Content *</label>
              <textarea
                id="announcement-content"
                required
                placeholder="Enter announcement content"
                value={form.content}
                onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))}
              />
            </div>
            <button type="submit" className="submit-btn" disabled={submitting}>
              {submitting ? "Publishing…" : "Publish Announcement"}
            </button>
          </form>
        </div>

        {/* List */}
        <div className="announcement-list-section">
          <div className="announcement-list-header">
            <h2>Published Announcements</h2>
          </div>
          <div id="announcementList" style={{ flex: 1, overflowY: "auto" }}>
            {announcements.length === 0 ? (
              <div className="empty-state"><p>No announcements</p></div>
            ) : (
              announcements.map((item) => (
                <div className="announcement-item" key={item.id}>
                  <div className="announcement-item-header">
                    <h3 className="announcement-title">{item.title}</h3>
                    <div>
                      <button
                        className="announcement-edit-btn"
                        onClick={() => onEdit(item)}
                      >
                        Edit
                      </button>
                      <button
                        className="announcement-delete-btn"
                        onClick={() => onDelete(item)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <div className="announcement-content">{item.content}</div>
                  <div className="announcement-meta">
                    <span>Created by: {item.created_by}</span>
                    <span>Created at: {item.created_at}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Maintenance Panel ─────────────────────────────────────────────────────────

function MaintenancePanel({ maintenanceList, onEdit, onDelete }) {
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const canCreate = maintenanceList.length === 0;

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmed = content.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("content", trimmed);
      const res = await fetch(buildApiUrl("api/maintenance/create_api.php"), {
        method: "POST", body: fd, credentials: "include",
      });
      const json = await res.json();
      if (json.success) {
        setContent("");
        onEdit(); // triggers reload
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div id="panel-maintenance" className="page-panel">
      <div className="maintenance-layout">
        {/* Create Form */}
        <div className="maintenance-form-section">
          <h2 style={{ marginTop: 0, color: "#002C49", fontFamily: "'Amaranth', sans-serif", fontSize: "clamp(16px, 1.25vw, 24px)", marginBottom: "clamp(8px, 0.73vw, 14px)" }}>
            Create New Maintenance Content
          </h2>
          {!canCreate && (
            <div
              id="maintenanceFormWarning"
              style={{ background: "#fef3c7", border: "1px solid #fbbf24", borderRadius: 8, padding: 12, marginBottom: 16, color: "#92400e", fontSize: "clamp(11px, 0.73vw, 14px)" }}
            >
              <strong>⚠️ Notice:</strong> Maintenance content already exists. Please delete the existing content before creating a new one.
            </div>
          )}
          <form id="maintenanceForm" onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="maintenanceContent">Content *</label>
              <textarea
                id="maintenanceContent"
                required
                placeholder="Enter maintenance content"
                disabled={!canCreate}
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
            </div>
            <button type="submit" className="submit-btn" disabled={!canCreate || submitting}>
              {submitting ? "Publishing…" : "Publish Maintenance Content"}
            </button>
          </form>
        </div>

        {/* List */}
        <div className="maintenance-list-section">
          <div className="maintenance-list-header">
            <h2>Published Maintenance Content</h2>
          </div>
          <div id="maintenanceList" style={{ flex: 1, overflowY: "auto" }}>
            {maintenanceList.length === 0 ? (
              <div className="empty-state"><p>No maintenance content</p></div>
            ) : (
              maintenanceList.map((item) => (
                <div className="maintenance-item" key={item.id}>
                  <div className="maintenance-item-header">
                    <div style={{ flex: 1 }} />
                    <div>
                      <button className="maintenance-edit-btn" onClick={() => onEdit(item)}>
                        Edit
                      </button>
                      <button className="maintenance-delete-btn" onClick={() => onDelete(item)}>
                        Delete
                      </button>
                    </div>
                  </div>
                  <div className="maintenance-content">{item.content}</div>
                  <div className="announcement-meta">
                    <span>Created by: {item.created_by}</span>
                    <span>Created at: {item.created_at}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AnnouncementPage() {
  const navigate = useNavigate();

  // Stable asset version — computed once per mount
  const assetVersion = useMemo(() => Date.now(), []);

  const [ready, setReady] = useState(false);
  const [activeTab, setActiveTab] = useState("announcement");

  // Toast: array of { id, message, type, visible }
  const [notices, setNotices] = useState([]);

  // Data
  const [announcements, setAnnouncements] = useState([]);
  const [maintenanceList, setMaintenanceList] = useState([]);

  // Edit modals
  const [editAnnouncement, setEditAnnouncement] = useState({ id: "", title: "", content: "" });
  const [announcementModalOpen, setAnnouncementModalOpen] = useState(false);
  const [editMaintenance, setEditMaintenance] = useState({ id: "", content: "" });
  const [maintenanceModalOpen, setMaintenanceModalOpen] = useState(false);

  // Confirm modal
  const [confirmModal, setConfirmModal] = useState(null); // { message, onConfirm }

  // ── Toast helper ────────────────────────────────────────────────────────────
  const showNotice = useCallback((message, type = "success") => {
    const id = Date.now() + Math.random();
    setNotices((prev) => [...prev, { id, message, type, visible: false }]);
    // animate in
    setTimeout(() => {
      setNotices((prev) => prev.map((n) => n.id === id ? { ...n, visible: true } : n));
    }, 10);
    // fade out
    setTimeout(() => {
      setNotices((prev) => prev.map((n) => n.id === id ? { ...n, visible: false } : n));
      setTimeout(() => setNotices((prev) => prev.filter((n) => n.id !== id)), 300);
    }, 3000);
  }, []);

  // ── CSS ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    document.body.classList.remove("bg", "dashboard-page");
    document.body.classList.add("announcement-page");
    const links = [];
    const addCss = (href) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      document.head.appendChild(link);
      links.push(link);
    };
    addCss(assetUrl(`css/accountCSS.css?v=${assetVersion}`));
    addCss(assetUrl(`css/announcement.css?v=${assetVersion}`));
    return () => {
      document.body.classList.remove("announcement-page");
      document.body.classList.add("bg");
      links.forEach((l) => l.parentNode?.removeChild(l));
    };
  }, [assetVersion]);

  // ── Data loaders ────────────────────────────────────────────────────────────
  const loadAnnouncements = useCallback(async () => {
    try {
      const res = await fetch(buildApiUrl("api/announcements/announcement_list_api.php"), { credentials: "include" });
      const json = await res.json();
      setAnnouncements(json.success && Array.isArray(json.data) ? json.data : []);
    } catch (err) {
      showNotice(`Failed to load announcements: ${err.message}`, "error");
    }
  }, [showNotice]);

  const loadMaintenance = useCallback(async () => {
    try {
      const res = await fetch(buildApiUrl("api/maintenance/list_api.php"), { credentials: "include" });
      const json = await res.json();
      setMaintenanceList(json.success && Array.isArray(json.data) ? json.data : []);
    } catch (err) {
      showNotice(`Failed to load maintenance content: ${err.message}`, "error");
    }
  }, [showNotice]);

  // ── Auth + initial load ─────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(buildApiUrl("api/session/current_user_api.php"), { credentials: "include" });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok || !json.success || !json.data) { navigate("/login", { replace: true }); return; }
        if (!json.data.has_c168_domain_page_access) { navigate("/dashboard", { replace: true }); return; }
        await Promise.all([loadAnnouncements(), loadMaintenance()]);
        if (!cancelled) setReady(true);
      } catch {
        if (!cancelled) navigate("/login", { replace: true });
      }
    })();
    return () => { cancelled = true; };
  }, [navigate, loadAnnouncements, loadMaintenance]);

  if (!ready) return null;

  // ── Announcement handlers ────────────────────────────────────────────────────

  function handleAnnouncementEdit(item) {
    // Called with no args from AnnouncementPanel after create (triggers reload)
    if (!item) { loadAnnouncements(); showNotice("Announcement published successfully"); return; }
    setEditAnnouncement({ id: item.id, title: item.title || "", content: item.content || "" });
    setAnnouncementModalOpen(true);
  }

  function handleAnnouncementDelete(item) {
    setConfirmModal({
      message: `Are you sure you want to delete announcement "${item.title}"?\nThis action cannot be undone.`,
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          const fd = new FormData();
          fd.append("id", item.id);
          const res = await fetch(buildApiUrl("api/announcements/announcement_delete_api.php"), {
            method: "POST", body: fd, credentials: "include",
          });
          const json = await res.json();
          if (json.success) {
            showNotice("Announcement deleted successfully");
            await loadAnnouncements();
          } else {
            showNotice(`Delete failed: ${json.message || json.error || "Unknown error"}`, "error");
          }
        } catch (err) {
          showNotice(`Failed to delete announcement: ${err.message}`, "error");
        }
      },
    });
  }

  async function saveEditedAnnouncement() {
    const title = editAnnouncement.title.trim();
    const content = editAnnouncement.content.trim();
    if (!title || !content) { showNotice("Please fill in both title and content", "error"); return; }
    try {
      const fd = new FormData();
      fd.append("id", editAnnouncement.id);
      fd.append("title", title);
      fd.append("content", content);
      const res = await fetch(buildApiUrl("api/announcements/announcement_update_api.php"), {
        method: "POST", body: fd, credentials: "include",
      });
      const json = await res.json();
      if (json.success) {
        showNotice("Announcement updated successfully");
        setAnnouncementModalOpen(false);
        await loadAnnouncements();
      } else {
        showNotice(`Update failed: ${json.message || json.error || "Unknown error"}`, "error");
      }
    } catch (err) {
      showNotice(`Failed to update announcement: ${err.message}`, "error");
    }
  }

  // ── Maintenance handlers ─────────────────────────────────────────────────────

  function handleMaintenanceEdit(item) {
    if (!item) { loadMaintenance(); showNotice("Maintenance content published successfully"); return; }
    setEditMaintenance({ id: item.id, content: item.content || "" });
    setMaintenanceModalOpen(true);
  }

  function handleMaintenanceDelete(item) {
    setConfirmModal({
      message: "Are you sure you want to delete this maintenance content?\nThis action cannot be undone.",
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          const fd = new FormData();
          fd.append("id", item.id);
          const res = await fetch(buildApiUrl("api/maintenance/delete_api.php"), {
            method: "POST", body: fd, credentials: "include",
          });
          const json = await res.json();
          if (json.success) {
            showNotice("Maintenance content deleted successfully");
            await loadMaintenance();
          } else {
            showNotice(`Delete failed: ${json.message || json.error || "Unknown error"}`, "error");
          }
        } catch (err) {
          showNotice(`Failed to delete maintenance content: ${err.message}`, "error");
        }
      },
    });
  }

  async function saveEditedMaintenance() {
    const content = editMaintenance.content.trim();
    if (!content) { showNotice("Please fill in the content", "error"); return; }
    try {
      const fd = new FormData();
      fd.append("id", editMaintenance.id);
      fd.append("content", content);
      const res = await fetch(buildApiUrl("api/maintenance/update_api.php"), {
        method: "POST", body: fd, credentials: "include",
      });
      const json = await res.json();
      if (json.success) {
        showNotice("Maintenance content updated successfully");
        setMaintenanceModalOpen(false);
        await loadMaintenance();
      } else {
        showNotice(`Update failed: ${json.message || json.error || "Unknown error"}`, "error");
      }
    } catch (err) {
      showNotice(`Failed to update maintenance content: ${err.message}`, "error");
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="container announcement-page-container">
        <div className="page-header">
          <h1>Announcement and Maintenance Management</h1>
          <div className="page-tabs">
            <button
              type="button"
              className={`page-tab${activeTab === "announcement" ? " active" : ""}`}
              data-page="announcement"
              onClick={() => setActiveTab("announcement")}
            >
              Announcement
            </button>
            <button
              type="button"
              className={`page-tab${activeTab === "maintenance" ? " active" : ""}`}
              data-page="maintenance"
              onClick={() => setActiveTab("maintenance")}
            >
              Maintenance
            </button>
          </div>
        </div>

        <div className="separator-line" />

        {activeTab === "announcement" && (
          <AnnouncementPanel
            announcements={announcements}
            onEdit={handleAnnouncementEdit}
            onDelete={handleAnnouncementDelete}
          />
        )}

        {activeTab === "maintenance" && (
          <MaintenancePanel
            maintenanceList={maintenanceList}
            onEdit={handleMaintenanceEdit}
            onDelete={handleMaintenanceDelete}
          />
        )}
      </div>

      {/* Toast */}
      <Toast notices={notices} />

      {/* Edit Modals */}
      <EditAnnouncementModal
        open={announcementModalOpen}
        draft={editAnnouncement}
        setDraft={setEditAnnouncement}
        onClose={() => setAnnouncementModalOpen(false)}
        onSave={saveEditedAnnouncement}
      />
      <EditMaintenanceModal
        open={maintenanceModalOpen}
        draft={editMaintenance}
        setDraft={setEditMaintenance}
        onClose={() => setMaintenanceModalOpen(false)}
        onSave={saveEditedMaintenance}
      />

      {/* React Confirm Modal (replaces window.confirm) */}
      {confirmModal && (
        <ConfirmModal
          message={confirmModal.message}
          onConfirm={confirmModal.onConfirm}
          onClose={() => setConfirmModal(null)}
        />
      )}
    </>
  );
}
