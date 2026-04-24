import React from "react";

export function EditAnnouncementModal({ open, draft, setDraft, onClose, onSave }) {
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

export function EditMaintenanceModal({ open, draft, setDraft, onClose, onSave }) {
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
