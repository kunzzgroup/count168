import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { buildApiUrl } from "../utils/apiUrl.js";

function readCookie(name) {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : "";
}

const AVATAR_MAP = {
  male1: "/images/avatar1.png",
  male2: "/images/avatar2.png",
  male3: "/images/avatar3.png",
  male4: "/images/avatar4.png",
  male5: "/images/avatar5.png",
  male6: "/images/avatar6.png",
  male7: "/images/avatar7.png",
  male8: "/images/avatar8.png",
  male9: "/images/avatar9.png",
  female1: "/images/female1.png",
  female2: "/images/female2.png",
  female3: "/images/female3.png",
  female4: "/images/female4.png",
  female5: "/images/female5.png",
  female6: "/images/female6.png",
  female7: "/images/female7.png",
  female8: "/images/female8.png",
  female9: "/images/female9.png",
};

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
  const avatarSrc = useMemo(() => AVATAR_MAP[readCookie("selectedAvatar")] || AVATAR_MAP.male1, [me]);
  const roleLabel = me?.role ? me.role.charAt(0).toUpperCase() + me.role.slice(1).toLowerCase() : "";
  const permissions = Array.isArray(me?.permissions) ? me.permissions : [];
  const hasFullPermissions = permissions.length === 0;
  const canAccess = (key) => hasFullPermissions || permissions.includes(key);

  const logout = () => window.location.assign(new URL("dashboard.php?logout=1", window.location.origin).href);
  const phpHref = (path) => new URL(path, window.location.origin).href;

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
      <div className="informationmenu-overlay" style={{ display: "none" }} aria-hidden="true" />
      <div className="informationmenu">
        <div className="informationmenu-header">
          <div className="header-logo-section">
            <img src="/images/count_whitelogo.png" alt="EAZYCOUNT" className="header-logo" />
          </div>
          <div className="user-info-container">
            <div className="avatar-selector-container">
              <div className="current-avatar">
                <img className="current-avatar-img" src={avatarSrc} alt="" width={36} height={36} />
              </div>
            </div>
            <div className="user-info">
              <div className="user-name">{me?.name || me?.login_id || "-"}</div>
              <div className="user-role">{roleLabel || "User"}</div>
            </div>
          </div>
        </div>

        <div className="informationmenu-content">
          <div className="content-separator" />
          {canAccess("home") && (
            <div className="informationmenu-section">
              <div className="informationmenu-section-title account-direct" onClick={() => navigate("/dashboard")} role="presentation">
                <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
                </svg>
                Home
              </div>
            </div>
          )}
          {me?.has_c168_domain_page_access && (
            <div className="informationmenu-section">
              <div className="informationmenu-section-title account-direct" onClick={() => navigate("/domain")} role="presentation">
                <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm6.93 8h-3.46c-.14-2.01-.5-3.88-1.06-5.38 2.16.76 3.76 2.62 4.52 5.38zm-6.93 0h-4.9c.13-1.78.58-3.51 1.28-4.9.53-1.04 1.16-1.79 1.78-2.21.6-.41.98-.46 1.84-.46v7.57zm0 2v7.57c-.86 0-1.24-.05-1.84-.46-.62-.43-1.25-1.17-1.78-2.21-.7-1.39-1.15-3.12-1.28-4.9h4.9zm2 7.43V12h4.9c-.13 1.78-.58 3.51-1.28 4.9-.53 1.04-1.16 1.79-1.78 2.21-.6.41-.98.46-1.84.46zm0-9.43V4.43c.86 0 1.24.05 1.84.46.62.43 1.25 1.17 1.78 2.21.7 1.39 1.15 3.12 1.28 4.9h-4.9zM5.07 12h3.46c.14 2.01.5 3.88 1.06 5.38-2.16-.76-3.76-2.62-4.52-5.38z" />
                </svg>
                Domain
              </div>
            </div>
          )}
          {me?.has_c168_domain_page_access && (
            <div className="informationmenu-section">
              <div className="informationmenu-section-title current-page" role="presentation">
                <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" />
                </svg>
                Announcement
              </div>
            </div>
          )}
          {canAccess("admin") && (
            <div className="informationmenu-section">
              <div className="informationmenu-section-title account-direct" onClick={() => window.location.assign(phpHref("userlist.php"))} role="presentation">
                <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
                </svg>
                Admin
              </div>
            </div>
          )}
          {canAccess("account") && (
            <>
              <div className="informationmenu-section">
                <div className="informationmenu-section-title account-direct" onClick={() => window.location.assign(phpHref("account-list.php"))} role="presentation">
                  <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                  </svg>
                  Account
                </div>
              </div>
              <div className="informationmenu-section">
                <div className="informationmenu-section-title account-direct" onClick={() => window.location.assign(phpHref("ownership.php"))} role="presentation">
                  <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
                  </svg>
                  Ownership
                </div>
              </div>
            </>
          )}
          {canAccess("process") && (
            <div className="informationmenu-section">
              <div className="informationmenu-section-title" onClick={() => window.location.assign(phpHref("processlist.php"))} role="presentation">
                <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                </svg>
                Process
              </div>
            </div>
          )}
          {canAccess("datacapture") && me?.company_has_gambling && (
            <div className="informationmenu-section">
              <div className="informationmenu-section-title" onClick={() => window.location.assign(phpHref("datacapture.php"))} role="presentation">
                <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z" />
                </svg>
                Data Capture
              </div>
            </div>
          )}
          {canAccess("payment") && (
            <div className="informationmenu-section">
              <div className="informationmenu-section-title" onClick={() => window.location.assign(phpHref("transaction.php"))} role="presentation">
                <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z" />
                </svg>
                Transaction Payment
              </div>
            </div>
          )}
          {canAccess("report") && me?.company_has_gambling && (
            <div className="informationmenu-section">
              <div className="informationmenu-section-title" onClick={() => window.location.assign(phpHref("customer_report.php"))} role="presentation">
                <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 2 2h8c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" />
                </svg>
                Report
              </div>
            </div>
          )}
          {canAccess("maintenance") && (
            <div className="informationmenu-section">
              <div className="informationmenu-section-title" onClick={() => window.location.assign(phpHref("payment_maintenance.php"))} role="presentation">
                <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z" />
                </svg>
                Maintenance
              </div>
            </div>
          )}
        </div>

        <div className="informationmenu-footer">
          <div className={`company-expiration-countdown ${me?.expiration_status || "normal"}`}>
            <svg className="expiration-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <div className="expiration-content">
              <span className="expiration-label">Exp:</span>
              <span className={`expiration-countdown-text ${me?.expiration_status || "normal"}`}>{me?.expiration_hint || "-"}</span>
            </div>
          </div>
          <button type="button" className="btn logout-btn" onClick={logout}>
            Logout
          </button>
        </div>
      </div>

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
