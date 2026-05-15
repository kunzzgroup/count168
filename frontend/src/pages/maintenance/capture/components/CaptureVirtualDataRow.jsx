import { memo } from "react";

const CaptureVirtualDataRow = memo(function CaptureVirtualDataRow({
  row,
  index,
  selected,
  onToggleRow,
  alreadyDeletedTitle,
}) {
  const isDeleted = row.is_deleted === 1 || row.is_deleted === "1" || row.is_deleted === true;
  const deletedBy = row.deleted_by || "";
  const dtsDeleted = row.dts_deleted || "";
  const deletedDisplay =
    isDeleted && deletedBy
      ? deletedBy + " (" + (dtsDeleted || "-") + ")"
      : isDeleted
        ? dtsDeleted || "-"
        : "-";

  const cid = row.capture_id;
  const stripe = index % 2 === 1 ? "maintenance-virtual-data-row--stripe" : "";
  const rowClass =
    "maintenance-virtual-data-row capture-virtual-data-row maintenance-row " +
    stripe +
    (isDeleted ? " maintenance-row-deleted" : "");

  return (
    <div role="row" className={rowClass}>
      <div role="cell" className="maintenance-virtual-cell maintenance-virtual-cell--center capture-virtual-cell--no">
        {row.no || index + 1}
      </div>
      <div role="cell" className="maintenance-virtual-cell maintenance-virtual-cell--mono">
        {row.dts_created || "-"}
      </div>
      <div role="cell" className="maintenance-virtual-cell maintenance-virtual-cell--left capture-virtual-cell--wrap">
        {row.product || "-"}
      </div>
      <div role="cell" className="maintenance-virtual-cell maintenance-virtual-cell--left capture-virtual-cell--wrap">
        {row.process || "-"}
      </div>
      <div role="cell" className="maintenance-virtual-cell maintenance-cell-currency">
        {row.currency || "-"}
      </div>
      <div role="cell" className="maintenance-virtual-cell maintenance-virtual-cell--left capture-virtual-cell--wrap">
        {row.wl_group || "-"}
      </div>
      <div role="cell" className="maintenance-virtual-cell maintenance-virtual-cell--left capture-virtual-cell--wrap">
        {row.submitted_by || "-"}
      </div>
      <div role="cell" className="maintenance-virtual-cell maintenance-virtual-cell--left capture-virtual-cell--wrap">
        {deletedDisplay}
      </div>
      <div role="cell" className="maintenance-virtual-cell maintenance-virtual-cell--center capture-virtual-cell-checkbox">
        <span className="maintenance-checkbox-cell-inner">
          <input
            type="checkbox"
            className="maintenance-row-checkbox"
            checked={selected}
            onChange={() => !isDeleted && onToggleRow(cid)}
            disabled={isDeleted}
            title={isDeleted ? alreadyDeletedTitle : ""}
          />
        </span>
      </div>
    </div>
  );
});

export default CaptureVirtualDataRow;
