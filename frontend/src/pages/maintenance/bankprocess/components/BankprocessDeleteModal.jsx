export default function BankprocessDeleteModal({ isOpen, selectedCount, onClose, onConfirm }) {
  return (
    <div id="confirmDeleteModal" className="maintenance-modal" style={{ display: isOpen ? "flex" : "none" }}>
      <div className="maintenance-confirm-modal-content">
        <div className="maintenance-confirm-icon-container">
          <svg className="maintenance-confirm-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 className="maintenance-confirm-title">Confirm Delete</h2>
        <p id="confirmDeleteMessage" className="maintenance-confirm-message">
          {`Are you sure you want to delete the selected ${selectedCount} Bank process transaction(s)? This action cannot be undone.`}
        </p>
        <div className="maintenance-confirm-actions">
          <button type="button" className="maintenance-btn maintenance-btn-cancel confirm-cancel" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="maintenance-btn maintenance-btn-delete confirm-delete" onClick={onConfirm}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
