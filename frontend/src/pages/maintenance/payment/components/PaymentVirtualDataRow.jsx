import { memo } from "react";
import {
  formatAmount,
  stripBankProcessDescriptionPrefix,
  isPaymentMaintenanceRowSelectable,
} from "../paymentMaintenanceLogic.js";

const PaymentVirtualDataRow = memo(function PaymentVirtualDataRow({
  row,
  index,
  selected,
  onToggleRow,
}) {
  const isDeleted = row.is_deleted === 1 || row.is_deleted === "1" || row.is_deleted === true;
  const deletedBy = row.deleted_by || "";
  const dtsDeleted = row.dts_deleted || "";
  const deletedDisplay =
    isDeleted && deletedBy
      ? `${deletedBy} (${dtsDeleted || "-"})`
      : isDeleted
        ? dtsDeleted || "-"
        : "-";

  const rawDescription = row.description || "";
  const displayDescription = stripBankProcessDescriptionPrefix(rawDescription);
  const tid = row.transaction_id;
  const canSelect = isPaymentMaintenanceRowSelectable(row);
  const stripe = index % 2 === 1 ? "maintenance-virtual-data-row--stripe" : "";

  return (
    <div
      role="row"
      className={`maintenance-virtual-data-row payment-virtual-data-row maintenance-row ${stripe}${
        isDeleted ? " maintenance-row-deleted" : ""
      }`}
    >
      <div role="cell" className="maintenance-virtual-cell maintenance-virtual-cell--center payment-virtual-cell-checkbox">
        <input
          type="checkbox"
          className="maintenance-row-checkbox"
          checked={selected}
          onChange={() => canSelect && onToggleRow(tid)}
          disabled={isDeleted || !canSelect}
        />
      </div>
      <div role="cell" className="maintenance-virtual-cell maintenance-virtual-cell--center payment-virtual-cell--no">
        {index + 1}
      </div>
      <div role="cell" className="maintenance-virtual-cell maintenance-virtual-cell--mono">
        {row.dts_created || "-"}
      </div>
      <div role="cell" className="maintenance-virtual-cell maintenance-virtual-cell--left payment-virtual-cell--wrap">
        {row.account || "-"}
      </div>
      <div role="cell" className="maintenance-virtual-cell maintenance-virtual-cell--left payment-virtual-cell--wrap">
        {row.from_account && row.from_account !== "-" ? row.from_account : "-"}
      </div>
      <div
        role="cell"
        className="maintenance-virtual-cell maintenance-virtual-cell--right maintenance-cell-amount"
      >
        {row.currency || ""} {formatAmount(row.amount)}
      </div>
      <div
        role="cell"
        className="maintenance-virtual-cell maintenance-virtual-cell--left payment-virtual-cell--wrap payment-virtual-cell--description"
        title={displayDescription}
      >
        <span className="payment-cell-clamp-2">{displayDescription || "-"}</span>
      </div>
      <div role="cell" className="maintenance-virtual-cell maintenance-virtual-cell--left payment-virtual-cell--wrap">
        <span className="payment-cell-clamp-2">{row.remark || "-"}</span>
      </div>
      <div role="cell" className="maintenance-virtual-cell maintenance-virtual-cell--left">
        {row.created_by || "-"}
      </div>
      <div role="cell" className="maintenance-virtual-cell maintenance-virtual-cell--center">
        {deletedDisplay}
      </div>
    </div>
  );
});

export default PaymentVirtualDataRow;
