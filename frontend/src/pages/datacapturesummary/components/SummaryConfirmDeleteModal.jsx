export default function SummaryConfirmDeleteModal({
  open,
  message,
  onCancel,
  onConfirm,
}) {
  return (
    <div
      id="confirmDeleteModal"
      className="summary-modal"
      style={{ display: open ? "flex" : "none" }}
      role="dialog"
      aria-modal={open}
      aria-hidden={!open}
    >
      <div className="summary-confirm-modal-content">
        <div className="summary-confirm-icon-container">
          <svg className="summary-confirm-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <h2 className="summary-confirm-title">Confirm Delete</h2>
        <p id="confirmDeleteMessage" className="summary-confirm-message">
          {message}
        </p>
        <div className="summary-confirm-actions">
          <button type="button" className="summary-btn summary-btn-cancel confirm-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="summary-btn summary-btn-delete confirm-delete" onClick={onConfirm}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
