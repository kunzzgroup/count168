/** Confirm delete modal — pure React replacement */
export default function DomainConfirmModal({ message, onConfirm, onClose }) {
  return (
    <div className="modal" style={{ display: "flex" }}>
      <div className="confirm-modal-content">
        <div className="confirm-icon-container">
          <svg className="confirm-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 className="confirm-title">Confirm Delete</h2>
        <p className="confirm-message">{message}</p>
        <div className="confirm-actions">
          <button type="button" className="btn btn-cancel confirm-cancel" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-delete confirm-delete" onClick={onConfirm}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
