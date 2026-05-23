export default function SummaryActionBar({
  t,
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
  const deleteLabel = deleteCount > 0 ? t("deleteWithCount", { count: deleteCount }) : t("delete");

  return (
    <div className="summary-action-buttons" id="actionButtons" style={{ display: "none" }}>
      <div style={{ flex: 1 }} />
      <div className="batch-controls-group">
        <label htmlFor="rateInput" className="batch-label">
          {t("rate")}
        </label>
        <input
          type="text"
          id="rateInput"
          className="batch-input"
          placeholder={t("ratePlaceholder")}
          value={rateInput}
          onChange={(e) => onRateInputChange(e.target.value)}
        />
        <button
          type="button"
          className="btn btn-add"
          id="rateSelectAllBtn"
          ref={rateSelectAllRef}
          data-rate-select-mode="all"
          onClick={onToggleRateSelectAll}
        >
          {rateSelectAllLabel}
        </button>
        <button type="button" className="btn btn-add" id="topSubmitBtn" onClick={onRateBatchSubmit}>
          {t("submit")}
        </button>
      </div>
      <div style={{ flex: 1 }} />
      <button
        type="button"
        className="btn btn-delete"
        id="summaryDeleteSelectedBtn"
        onClick={onDeleteSelected}
        title={t("deleteSelectedRows")}
        disabled={deleteDisabled}
      >
        {deleteLabel}
      </button>
    </div>
  );
}
