export default function SummaryActionBar({
  rateInput,
  onRateInputChange,
  rateSelectAllLabel,
  rateSelectAllRef,
  onToggleRateSelectAll,
  onRateBatchSubmit,
  deleteCount,
  deleteDisabled,
  onDeleteSelected,
}) {
  const deleteLabel = deleteCount > 0 ? `Delete (${deleteCount})` : "Delete";

  return (
    <div className="summary-action-buttons" id="actionButtons" style={{ display: "none" }}>
      <div style={{ flex: 1 }} />
      <div className="batch-controls-group">
        <label htmlFor="rateInput" className="batch-label">
          Rate
        </label>
        <input
          type="text"
          id="rateInput"
          className="batch-input"
          placeholder="e.g. *3 or /3"
          value={rateInput}
          onChange={(e) => onRateInputChange(e.target.value)}
        />
        <button
          type="button"
          className="btn-update-all"
          id="rateSelectAllBtn"
          ref={rateSelectAllRef}
          onClick={onToggleRateSelectAll}
        >
          {rateSelectAllLabel}
        </button>
        <button type="button" className="btn-update-all" id="topSubmitBtn" onClick={onRateBatchSubmit}>
          Submit
        </button>
      </div>
      <div style={{ flex: 1 }} />
      <button
        type="button"
        className={`summary-btn summary-btn-delete${deleteDisabled ? " summary-btn-delete--inactive" : ""}`}
        id="summaryDeleteSelectedBtn"
        onClick={onDeleteSelected}
        title="Delete selected rows"
        aria-disabled={deleteDisabled}
      >
        {deleteLabel}
      </button>
    </div>
  );
}
