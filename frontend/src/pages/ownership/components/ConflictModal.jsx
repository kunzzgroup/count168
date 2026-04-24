import React from "react";

export default function ConflictModal({ conflict, onResolve, onCancel }) {
  if (!conflict) return null;

  return (
    <div className="own-modal-overlay" role="presentation" onClick={onCancel}>
      <div className="own-modal" role="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="own-modal-header">
          <h3 className="own-modal-title">Multiple Matches Found</h3>
        </div>
        <div className="own-modal-body">
          <p className="own-modal-desc">
            This ID is used by two different partners. Which one do you want to link?
          </p>
          <div className="own-modal-options">
            <button
              type="button"
              className="own-btn-outline own-btn-conflict"
              onClick={() => onResolve("login")}
            >
              Link as Login ID:
              <br />
              <strong>{conflict.data?.login_partner}</strong>
            </button>
            <button
              type="button"
              className="own-btn-outline own-btn-conflict"
              onClick={() => onResolve("group")}
            >
              Join Group:
              <br />
              <strong>{conflict.data?.group_partner}</strong>
            </button>
          </div>
        </div>
        <div className="own-modal-footer">
          <button type="button" className="own-footer-btn own-btn-cancel" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
