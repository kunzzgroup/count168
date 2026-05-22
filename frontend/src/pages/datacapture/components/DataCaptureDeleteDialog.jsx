export default function DataCaptureDeleteDialog({
  open,
  deleteOption,
  onDeleteOptionChange,
  onConfirm,
  onClose,
}) {
  if (!open) {
    return null;
  }

  return (
    <div
      id="deleteDialog"
      className="delete-dialog"
      style={{ display: "block" }}
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="delete-dialog-content" role="dialog" aria-modal="true" aria-labelledby="dc-delete-dialog-title">
        <div className="delete-dialog-header">
          <span id="dc-delete-dialog-title">Delete</span>
          <span className="delete-dialog-close" role="presentation" onClick={onClose}>
            &times;
          </span>
        </div>
        <div className="delete-dialog-body">
          <div className="delete-dialog-title">Delete</div>
          <div className="delete-options">
            <label className="delete-option">
              <input
                type="radio"
                name="deleteOption"
                value="shiftLeft"
                checked={deleteOption === "shiftLeft"}
                onChange={() => onDeleteOptionChange("shiftLeft")}
              />
              <span>Shift cells left</span>
            </label>
            <label className="delete-option">
              <input
                type="radio"
                name="deleteOption"
                value="shiftUp"
                checked={deleteOption === "shiftUp"}
                onChange={() => onDeleteOptionChange("shiftUp")}
              />
              <span>Shift cells up</span>
            </label>
            <label className="delete-option">
              <input
                type="radio"
                name="deleteOption"
                value="entireRow"
                checked={deleteOption === "entireRow"}
                onChange={() => onDeleteOptionChange("entireRow")}
              />
              <span>Entire row</span>
            </label>
            <label className="delete-option">
              <input
                type="radio"
                name="deleteOption"
                value="entireColumn"
                checked={deleteOption === "entireColumn"}
                onChange={() => onDeleteOptionChange("entireColumn")}
              />
              <span>Entire column</span>
            </label>
          </div>
        </div>
        <div className="delete-dialog-footer">
          <button type="button" className="btn btn-save" onClick={(e) => { e.stopPropagation(); onConfirm(); }}>
            OK
          </button>
          <button type="button" className="btn btn-cancel" onClick={(e) => { e.stopPropagation(); onClose(); }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
