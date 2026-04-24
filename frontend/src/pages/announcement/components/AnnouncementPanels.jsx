import React, { useState } from "react";
import { buildApiUrl } from "../../../utils/apiUrl.js";

export function AnnouncementPanel({ announcements, onEdit, onDelete }) {
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
        onEdit(); // triggers reload in parent
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div id="panel-announcement" className="page-panel">
      <div className="announcement-layout">
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
                      <button className="announcement-edit-btn" onClick={() => onEdit(item)}>Edit</button>
                      <button className="announcement-delete-btn" onClick={() => onDelete(item)}>Delete</button>
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

export function MaintenancePanel({ maintenanceList, onEdit, onDelete }) {
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
        onEdit(); // triggers reload in parent
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div id="panel-maintenance" className="page-panel">
      <div className="maintenance-layout">
        <div className="maintenance-form-section">
          <h2 style={{ marginTop: 0, color: "#002C49", fontFamily: "'Amaranth', sans-serif", fontSize: "clamp(16px, 1.25vw, 24px)", marginBottom: "clamp(8px, 0.73vw, 14px)" }}>
            Create New Maintenance Content
          </h2>
          {!canCreate && (
            <div style={{ background: "#fef3c7", border: "1px solid #fbbf24", borderRadius: 8, padding: 12, marginBottom: 16, color: "#92400e", fontSize: "clamp(11px, 0.73vw, 14px)" }}>
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
                      <button className="maintenance-edit-btn" onClick={() => onEdit(item)}>Edit</button>
                      <button className="maintenance-delete-btn" onClick={() => onDelete(item)}>Delete</button>
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
