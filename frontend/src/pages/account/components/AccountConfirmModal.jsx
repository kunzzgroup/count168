import React from "react";

export default function AccountConfirmModal({ open, count, onConfirm, onClose }) {
  if (!open) return null;
  return (
    <div id="confirmDeleteModal" className="account-modal" style={{ display: "block" }}>
      <div className="account-modal-content" style={{ maxWidth: 400 }}>
        <div className="account-modal-header">
          <h2>Confirm Delete</h2>
          <span className="account-close" onClick={onClose}>&times;</span>
        </div>
        <div className="account-modal-body" style={{ textAlign: "center", padding: "20px" }}>
          <p>Are you sure you want to delete {count} selected account(s)?</p>
          <div style={{ marginTop: 25, display: "flex", justifyContent: "center", gap: 15 }}>
            <button className="account-btn account-btn-delete" onClick={onConfirm}>Delete</button>
            <button className="account-btn account-btn-cancel" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}
