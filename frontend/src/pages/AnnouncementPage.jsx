import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { buildApiUrl } from "../utils/apiUrl.js";


function Toast({ notice }) {
  return (
    <div id="notificationContainer">
      {notice ? <div className={`notification ${notice.type} show`}>{notice.message}</div> : null}
    </div>
  );
}

function EditAnnouncementModal({ open, draft, setDraft, onClose, onSave }) {
  if (!open) return null;
  return (
    <div
      id="editAnnouncementModal"
      className="edit-modal"
      style={{ display: "block" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="edit-modal-content">
        <div className="edit-modal-header">
          <h2>Edit Announcement</h2>
          <span className="edit-modal-close" onClick={onClose} role="button" aria-label="Close">
            &times;
          </span>
        </div>
        <form
          id="editAnnouncementForm"
          onSubmit={(e) => {
            e.preventDefault();
            onSave();
          }}
        >
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

function EditMaintenanceModal({ open, draft, setDraft, onClose, onSave }) {
  if (!open) return null;
  return (
    <div
      id="editMaintenanceModal"
      className="edit-modal"
      style={{ display: "block" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="edit-modal-content">
        <div className="edit-modal-header">
          <h2>Edit Maintenance Content</h2>
          <span className="edit-modal-close" onClick={onClose} role="button" aria-label="Close">
            &times;
          </span>
        </div>
        <form
          id="editMaintenanceForm"
          onSubmit={(e) => {
            e.preventDefault();
            onSave();
          }}
        >
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

export default function AnnouncementPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("announcement");
  const [me, setMe] = useState(null);
  const [notice, setNotice] = useState(null);
  const [announcements, setAnnouncements] = useState([]);
  const [maintenanceList, setMaintenanceList] = useState([]);
  const [announcementForm, setAnnouncementForm] = useState({ title: "", content: "" });
  const [maintenanceForm, setMaintenanceForm] = useState({ content: "" });
  const [announcementModalOpen, setAnnouncementModalOpen] = useState(false);
  const [maintenanceModalOpen, setMaintenanceModalOpen] = useState(false);
  const [editAnnouncement, setEditAnnouncement] = useState({ id: "", title: "", content: "" });
  const [editMaintenance, setEditMaintenance] = useState({ id: "", content: "" });

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(null), 3000);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    document.body.classList.remove("bg", "dashboard-page");
    document.body.classList.add("announcement-page");
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "/css/announcement.css";
    document.head.appendChild(link);

    return () => {
      document.body.classList.remove("announcement-page");
      document.body.classList.add("bg");
      document.head.removeChild(link);
    };
  }, []);

  const showNotice = (message, type = "success") => setNotice({ message, type });

  const loadAnnouncements = async () => {
    try {
      const response = await fetch(buildApiUrl("api/announcements/announcement_list_api.php"), { credentials: "include" });
      const result = await response.json();
      if (result.success && Array.isArray(result.data)) {
        setAnnouncements(result.data);
      } else {
        setAnnouncements([]);
      }
    } catch (error) {
      showNotice(`Failed to load announcements: ${error.message}`, "error");
    }
  };

  const loadMaintenance = async () => {
    try {
      const response = await fetch(buildApiUrl("api/maintenance/list_api.php"), { credentials: "include" });
      const result = await response.json();
      if (result.success && Array.isArray(result.data)) {
        setMaintenanceList(result.data);
      } else {
        setMaintenanceList([]);
      }
    } catch (error) {
      showNotice(`Failed to load maintenance content: ${error.message}`, "error");
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(buildApiUrl("api/session/current_user_api.php"), { credentials: "include" });
        const json = await res.json();
        if (!res.ok || !json.success || !json.data) {
          navigate("/login", { replace: true });
          return;
        }
        const u = json.data;
        if (!u.has_c168_domain_page_access) {
          navigate("/dashboard", { replace: true });
          return;
        }
        setMe(u);
        await Promise.all([loadAnnouncements(), loadMaintenance()]);
      } catch {
        navigate("/login", { replace: true });
      }
    })();
  }, [navigate]);

  const canCreateMaintenance = maintenanceList.length === 0;
  const submitAnnouncement = async (e) => {
    e.preventDefault();
    const title = announcementForm.title.trim();
    const content = announcementForm.content.trim();
    if (!title || !content) {
      showNotice("Please fill in both title and content", "error");
      return;
    }
    const fd = new FormData();
    fd.append("title", title);
    fd.append("content", content);
    try {
      const response = await fetch(buildApiUrl("api/announcements/announcement_create_api.php"), {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const result = await response.json();
      if (result.success) {
        showNotice("Announcement published successfully");
        setAnnouncementForm({ title: "", content: "" });
        await loadAnnouncements();
      } else {
        showNotice(`Publish failed: ${result.message || result.error || "Unknown error"}`, "error");
      }
    } catch (error) {
      showNotice(`Failed to publish announcement: ${error.message}`, "error");
    }
  };

  const submitMaintenance = async (e) => {
    e.preventDefault();
    const content = maintenanceForm.content.trim();
    if (!content) {
      showNotice("Please fill in the content", "error");
      return;
    }
    const fd = new FormData();
    fd.append("content", content);
    try {
      const response = await fetch(buildApiUrl("api/maintenance/create_api.php"), {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const result = await response.json();
      if (result.success) {
        showNotice("Maintenance content published successfully");
        setMaintenanceForm({ content: "" });
        await loadMaintenance();
      } else {
        showNotice(`Publish failed: ${result.message || result.error || "Unknown error"}`, "error");
      }
    } catch (error) {
      showNotice(`Failed to publish maintenance content: ${error.message}`, "error");
    }
  };

  const deleteAnnouncement = async (id, title) => {
    const msg = title
      ? `Are you sure you want to delete announcement "${title}"? This action cannot be undone.`
      : "Are you sure you want to delete this announcement? This action cannot be undone.";
    if (!window.confirm(msg)) return;
    const fd = new FormData();
    fd.append("id", id);
    try {
      const response = await fetch(buildApiUrl("api/announcements/announcement_delete_api.php"), {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const result = await response.json();
      if (result.success) {
        showNotice("Announcement deleted successfully");
        await loadAnnouncements();
      } else {
        showNotice(`Delete failed: ${result.message || result.error || "Unknown error"}`, "error");
      }
    } catch (error) {
      showNotice(`Failed to delete announcement: ${error.message}`, "error");
    }
  };

  const deleteMaintenance = async (id) => {
    if (!window.confirm("Are you sure you want to delete this maintenance content? This action cannot be undone.")) return;
    const fd = new FormData();
    fd.append("id", id);
    try {
      const response = await fetch(buildApiUrl("api/maintenance/delete_api.php"), {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const result = await response.json();
      if (result.success) {
        showNotice("Maintenance content deleted successfully");
        await loadMaintenance();
      } else {
        showNotice(`Delete failed: ${result.message || result.error || "Unknown error"}`, "error");
      }
    } catch (error) {
      showNotice(`Failed to delete maintenance content: ${error.message}`, "error");
    }
  };

  const saveEditedAnnouncement = async () => {
    const title = editAnnouncement.title.trim();
    const content = editAnnouncement.content.trim();
    if (!title || !content) {
      showNotice("Please fill in both title and content", "error");
      return;
    }
    const fd = new FormData();
    fd.append("id", editAnnouncement.id);
    fd.append("title", title);
    fd.append("content", content);
    try {
      const response = await fetch(buildApiUrl("api/announcements/announcement_update_api.php"), {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const result = await response.json();
      if (result.success) {
        showNotice("Announcement updated successfully");
        setAnnouncementModalOpen(false);
        await loadAnnouncements();
      } else {
        showNotice(`Update failed: ${result.message || result.error || "Unknown error"}`, "error");
      }
    } catch (error) {
      showNotice(`Failed to update announcement: ${error.message}`, "error");
    }
  };

  const saveEditedMaintenance = async () => {
    const content = editMaintenance.content.trim();
    if (!content) {
      showNotice("Please fill in the content", "error");
      return;
    }
    const fd = new FormData();
    fd.append("id", editMaintenance.id);
    fd.append("content", content);
    try {
      const response = await fetch(buildApiUrl("api/maintenance/update_api.php"), {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const result = await response.json();
      if (result.success) {
        showNotice("Maintenance content updated successfully");
        setMaintenanceModalOpen(false);
        await loadMaintenance();
      } else {
        showNotice(`Update failed: ${result.message || result.error || "Unknown error"}`, "error");
      }
    } catch (error) {
      showNotice(`Failed to update maintenance content: ${error.message}`, "error");
    }
  };

  return (
    <>
      <div className="container announcement-page-container">
        <div className="page-header">
          <h1>Announcement and Maintenance Management</h1>
          <div className="page-tabs">
            <button type="button" className={`page-tab${activeTab === "announcement" ? " active" : ""}`} onClick={() => setActiveTab("announcement")}>
              Announcement
            </button>
            <button type="button" className={`page-tab${activeTab === "maintenance" ? " active" : ""}`} onClick={() => setActiveTab("maintenance")}>
              Maintenance
            </button>
          </div>
        </div>

        <div className="separator-line" />

        {activeTab === "announcement" && (
          <div className="page-panel">
            <div className="announcement-layout">
              <div className="announcement-form-section">
                <h2 style={{ marginTop: 0, color: "#002C49", fontFamily: "Amaranth", fontSize: "clamp(16px, 1.25vw, 24px)", marginBottom: "clamp(8px, 0.73vw, 14px)" }}>
                  Create New Announcement
                </h2>
                <form id="announcementForm" onSubmit={submitAnnouncement}>
                  <div className="form-group">
                    <label htmlFor="title">Title *</label>
                    <input
                      id="title"
                      type="text"
                      required
                      maxLength={500}
                      placeholder="Enter announcement title"
                      value={announcementForm.title}
                      onChange={(e) => setAnnouncementForm((p) => ({ ...p, title: e.target.value }))}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="content">Content *</label>
                    <textarea
                      id="content"
                      required
                      placeholder="Enter announcement content"
                      value={announcementForm.content}
                      onChange={(e) => setAnnouncementForm((p) => ({ ...p, content: e.target.value }))}
                    />
                  </div>
                  <button type="submit" className="submit-btn">
                    Publish Announcement
                  </button>
                </form>
              </div>

              <div className="announcement-list-section">
                <div className="announcement-list-header">
                  <h2>Published Announcements</h2>
                </div>
                <div id="announcementList" style={{ flex: 1, overflowY: "auto" }}>
                  {announcements.length === 0 ? (
                    <div className="empty-state">
                      <p>No announcements</p>
                    </div>
                  ) : (
                    announcements.map((item) => (
                      <div className="announcement-item" key={item.id}>
                        <div className="announcement-item-header">
                          <h3 className="announcement-title">{item.title}</h3>
                          <div>
                            <button
                              className="announcement-edit-btn"
                              onClick={() => {
                                setEditAnnouncement({ id: item.id, title: item.title || "", content: item.content || "" });
                                setAnnouncementModalOpen(true);
                              }}
                            >
                              Edit
                            </button>
                            <button className="announcement-delete-btn" onClick={() => deleteAnnouncement(item.id, item.title)}>
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
        )}

        {activeTab === "maintenance" && (
          <div className="page-panel">
            <div className="maintenance-layout">
              <div className="maintenance-form-section">
                <h2 style={{ marginTop: 0, color: "#002C49", fontFamily: "Amaranth", fontSize: "clamp(16px, 1.25vw, 24px)", marginBottom: "clamp(8px, 0.73vw, 14px)" }}>
                  Create New Maintenance Content
                </h2>
                {!canCreateMaintenance && (
                  <div
                    id="maintenanceFormWarning"
                    style={{
                      background: "#fef3c7",
                      border: "1px solid #fbbf24",
                      borderRadius: 8,
                      padding: 12,
                      marginBottom: 16,
                      color: "#92400e",
                      fontSize: "clamp(11px, 0.73vw, 14px)",
                    }}
                  >
                    <strong>Notice:</strong> Maintenance content already exists. Please delete the existing content before creating a new one.
                  </div>
                )}
                <form id="maintenanceForm" onSubmit={submitMaintenance}>
                  <div className="form-group">
                    <label htmlFor="maintenanceContent">Content *</label>
                    <textarea
                      id="maintenanceContent"
                      required
                      placeholder="Enter maintenance content"
                      disabled={!canCreateMaintenance}
                      value={maintenanceForm.content}
                      onChange={(e) => setMaintenanceForm({ content: e.target.value })}
                    />
                  </div>
                  <button type="submit" className="submit-btn" disabled={!canCreateMaintenance}>
                    Publish Maintenance Content
                  </button>
                </form>
              </div>

              <div className="maintenance-list-section">
                <div className="maintenance-list-header">
                  <h2>Published Maintenance Content</h2>
                </div>
                <div id="maintenanceList" style={{ flex: 1, overflowY: "auto" }}>
                  {maintenanceList.length === 0 ? (
                    <div className="empty-state">
                      <p>No maintenance content</p>
                    </div>
                  ) : (
                    maintenanceList.map((item) => (
                      <div className="maintenance-item" key={item.id}>
                        <div className="maintenance-item-header">
                          <div style={{ flex: 1 }} />
                          <div>
                            <button
                              className="maintenance-edit-btn"
                              onClick={() => {
                                setEditMaintenance({ id: item.id, content: item.content || "" });
                                setMaintenanceModalOpen(true);
                              }}
                            >
                              Edit
                            </button>
                            <button className="maintenance-delete-btn" onClick={() => deleteMaintenance(item.id)}>
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
        )}
      </div>

      <Toast notice={notice} />

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
    </>
  );
}
