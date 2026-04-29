import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { assetUrl, buildApiUrl } from "../../utils/apiUrl.js";

// Components
import { AnnouncementToast, AnnouncementConfirmModal } from "./components/AnnouncementCommon.jsx";
import { EditAnnouncementModal, EditMaintenanceModal } from "./components/AnnouncementModals.jsx";
import { AnnouncementPanel, MaintenancePanel } from "./components/AnnouncementPanels.jsx";

export default function AnnouncementPage() {
  const navigate = useNavigate();
  const assetVersion = useMemo(() => Date.now(), []);

  const [ready, setReady] = useState(false);
  const [activeTab, setActiveTab] = useState("announcement");
  const [notices, setNotices] = useState([]);

  // Data
  const [announcements, setAnnouncements] = useState([]);
  const [maintenanceList, setMaintenanceList] = useState([]);

  // Modals
  const [editAnnouncement, setEditAnnouncement] = useState({ id: "", title: "", content: "" });
  const [announcementModalOpen, setAnnouncementModalOpen] = useState(false);
  const [editMaintenance, setEditMaintenance] = useState({ id: "", content: "" });
  const [maintenanceModalOpen, setMaintenanceModalOpen] = useState(false);
  const [confirmModal, setConfirmModal] = useState(null);

  const toastTimerRef = useRef(null);

  const showNotice = useCallback((message, type = "success") => {
    const id = Date.now() + Math.random();
    setNotices((prev) => [...prev, { id, message, type, visible: false }]);
    setTimeout(() => {
      setNotices((prev) => prev.map((n) => n.id === id ? { ...n, visible: true } : n));
    }, 10);
    setTimeout(() => {
      setNotices((prev) => prev.map((n) => n.id === id ? { ...n, visible: false } : n));
      setTimeout(() => setNotices((prev) => prev.filter((n) => n.id !== id)), 300);
    }, 3000);
  }, []);

  useEffect(() => {
    document.body.classList.remove("bg", "dashboard-page");
    document.body.classList.add("announcement-page");
    const links = [];
    const addCss = (href) => {
      const link = document.createElement("link");
      link.rel = "stylesheet"; link.href = href;
      document.head.appendChild(link);
      links.push(link);
    };
    addCss(assetUrl(`css/accountCSS.css?v=${assetVersion}`));
    addCss(assetUrl(`css/announcement.css?v=${assetVersion}`));
    return () => {
      document.body.classList.remove("announcement-page", "bg");
      document.body.classList.add("dashboard-page");
      links.forEach((l) => l.parentNode?.removeChild(l));
    };
  }, [assetVersion]);

  const loadAnnouncements = useCallback(async () => {
    try {
      const res = await fetch(buildApiUrl("api/announcements/announcement_list_api.php"), { credentials: "include" });
      const json = await res.json();
      setAnnouncements(json.success && Array.isArray(json.data) ? json.data : []);
    } catch (err) { showNotice(`Failed to load announcements: ${err.message}`, "error"); }
  }, [showNotice]);

  const loadMaintenance = useCallback(async () => {
    try {
      const res = await fetch(buildApiUrl("api/maintenance/list_api.php"), { credentials: "include" });
      const json = await res.json();
      setMaintenanceList(json.success && Array.isArray(json.data) ? json.data : []);
    } catch (err) { showNotice(`Failed to load maintenance content: ${err.message}`, "error"); }
  }, [showNotice]);

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
      } catch { if (!cancelled) navigate("/login", { replace: true }); }
    })();
    return () => { cancelled = true; };
  }, [navigate, loadAnnouncements, loadMaintenance]);

  if (!ready) return null;

  // Handlers
  function handleAnnouncementEdit(item) {
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
          const fd = new FormData(); fd.append("id", item.id);
          const res = await fetch(buildApiUrl("api/announcements/announcement_delete_api.php"), { method: "POST", body: fd, credentials: "include" });
          const json = await res.json();
          if (json.success) { showNotice("Announcement deleted successfully"); loadAnnouncements(); }
          else showNotice(`Delete failed: ${json.message || "Unknown error"}`, "error");
        } catch (err) { showNotice(`Failed to delete: ${err.message}`, "error"); }
      },
    });
  }

  async function saveEditedAnnouncement() {
    try {
      const fd = new FormData();
      fd.append("id", editAnnouncement.id); fd.append("title", editAnnouncement.title.trim()); fd.append("content", editAnnouncement.content.trim());
      const res = await fetch(buildApiUrl("api/announcements/announcement_update_api.php"), { method: "POST", body: fd, credentials: "include" });
      const json = await res.json();
      if (json.success) { showNotice("Announcement updated successfully"); setAnnouncementModalOpen(false); loadAnnouncements(); }
      else showNotice(`Update failed: ${json.message || "Unknown error"}`, "error");
    } catch (err) { showNotice(`Update failed: ${err.message}`, "error"); }
  }

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
          const fd = new FormData(); fd.append("id", item.id);
          const res = await fetch(buildApiUrl("api/maintenance/delete_api.php"), { method: "POST", body: fd, credentials: "include" });
          const json = await res.json();
          if (json.success) { showNotice("Maintenance content deleted successfully"); loadMaintenance(); }
          else showNotice(`Delete failed: ${json.message || "Unknown error"}`, "error");
        } catch (err) { showNotice(`Delete failed: ${err.message}`, "error"); }
      },
    });
  }

  async function saveEditedMaintenance() {
    try {
      const fd = new FormData();
      fd.append("id", editMaintenance.id); fd.append("content", editMaintenance.content.trim());
      const res = await fetch(buildApiUrl("api/maintenance/update_api.php"), { method: "POST", body: fd, credentials: "include" });
      const json = await res.json();
      if (json.success) { showNotice("Maintenance content updated successfully"); setMaintenanceModalOpen(false); loadMaintenance(); }
      else showNotice(`Update failed: ${json.message || "Unknown error"}`, "error");
    } catch (err) { showNotice(`Update failed: ${err.message}`, "error"); }
  }

  return (
    <>
      <div className="container announcement-page-container">
        <div className="page-header">
          <h1>Announcement and Maintenance Management</h1>
          <div className="page-tabs">
            <button type="button" className={`page-tab${activeTab === "announcement" ? " active" : ""}`} onClick={() => setActiveTab("announcement")}>Announcement</button>
            <button type="button" className={`page-tab${activeTab === "maintenance" ? " active" : ""}`} onClick={() => setActiveTab("maintenance")}>Maintenance</button>
          </div>
        </div>
        <div className="separator-line" />
        {activeTab === "announcement" && <AnnouncementPanel announcements={announcements} onEdit={handleAnnouncementEdit} onDelete={handleAnnouncementDelete} />}
        {activeTab === "maintenance" && <MaintenancePanel maintenanceList={maintenanceList} onEdit={handleMaintenanceEdit} onDelete={handleMaintenanceDelete} />}
      </div>
      <AnnouncementToast notices={notices} />
      <EditAnnouncementModal open={announcementModalOpen} draft={editAnnouncement} setDraft={setEditAnnouncement} onClose={() => setAnnouncementModalOpen(false)} onSave={saveEditedAnnouncement} />
      <EditMaintenanceModal open={maintenanceModalOpen} draft={editMaintenance} setDraft={setEditMaintenance} onClose={() => setMaintenanceModalOpen(false)} onSave={saveEditedMaintenance} />
      {confirmModal && <AnnouncementConfirmModal message={confirmModal.message} onConfirm={confirmModal.onConfirm} onClose={() => setConfirmModal(null)} />}
    </>
  );
}
