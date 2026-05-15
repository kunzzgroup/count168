import {
  formatAmount,
  stripBankProcessDescriptionPrefix,
  isPaymentMaintenanceRowSelectable,
  getPaymentMaintenanceRowRenderKey,
} from "../paymentMaintenanceLogic.js";
import { memo, useEffect, useMemo, useRef } from "react";

function PaymentTableHead({ selectAllRef, selectAll, toggleSelectAll, m, disableSelectAll }) {
  return (
    <thead>
      <tr>
        <th className="maintenance-select-all-header">
          <input
            type="checkbox"
            id={disableSelectAll ? undefined : "select_all_payment"}
            ref={disableSelectAll ? undefined : selectAllRef}
            className="maintenance-row-checkbox"
            checked={selectAll}
            onChange={toggleSelectAll}
            title={m.selectAll}
            disabled={disableSelectAll}
          />
        </th>
        <th>{m.tblNo}</th>
        <th>{m.tblCreatedAt}</th>
        <th>{m.tblAccountTo}</th>
        <th>{m.tblAccountFrom}</th>
        <th className="maintenance-header-amount">{m.tblAmount}</th>
        <th>{m.tblDescription}</th>
        <th>{m.tblRemark}</th>
        <th>{m.tblSubmitter}</th>
        <th>{m.tblDeleter}</th>
      </tr>
    </thead>
  );
}

const PaymentMaintenanceRow = memo(function PaymentMaintenanceRow({
  row,
  index,
  isSelected,
  onToggleRow,
  m,
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

  return (
    <tr className={`maintenance-row ${isDeleted ? "maintenance-row-deleted" : ""}`}>
      <td className="maintenance-table-cell maintenance-cell-checkbox">
        <input
          type="checkbox"
          className="maintenance-row-checkbox"
          checked={isSelected}
          onChange={() => canSelect && onToggleRow(tid)}
          disabled={isDeleted || !canSelect}
        />
      </td>
      <td className="maintenance-table-cell">{index + 1}</td>
      <td className="maintenance-table-cell">{row.dts_created || "-"}</td>
      <td className="maintenance-table-cell">{row.account || "-"}</td>
      <td className="maintenance-table-cell">{row.from_account && row.from_account !== "-" ? row.from_account : "-"}</td>
      <td className="maintenance-table-cell maintenance-cell-amount">
        {row.currency || ""} {formatAmount(row.amount)}
      </td>
      <td className="maintenance-table-cell" title={displayDescription}>
        {displayDescription || "-"}
      </td>
      <td className="maintenance-table-cell">{row.remark || "-"}</td>
      <td className="maintenance-table-cell">{row.created_by || "-"}</td>
      <td className="maintenance-table-cell">{deletedDisplay}</td>
    </tr>
  );
});

export default function PaymentMaintenanceTable({
  data,
  listEpoch = 0,
  /** 与 paymentData 已提交快照一致的公司 id，用于行 key 前缀，避免切换公司时 React 复用 <tr> 窜行 */
  rowKeyCompanyId = null,
  loading,
  listSyncing = false,
  selectedIds,
  toggleSelect,
  toggleSelectAll,
  selectAll,
  m,
}) {
  const selectAllRef = useRef(null);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  useEffect(() => {
    if (selectAllRef.current) {
      const selectable = data.filter(
        (r) =>
          isPaymentMaintenanceRowSelectable(r) &&
          !(r.is_deleted === 1 || r.is_deleted === "1" || r.is_deleted === true)
      );
      const checked = selectable.filter((r) => selectedSet.has(r.transaction_id));

      selectAllRef.current.indeterminate = checked.length > 0 && checked.length < selectable.length;
    }
  }, [selectedSet, data]);

  if (loading) {
    return (
      <div className="maintenance-list-container" style={{ display: "block" }}>
        <table className="maintenance-table">
          <PaymentTableHead
            selectAllRef={selectAllRef}
            selectAll={selectAll}
            toggleSelectAll={toggleSelectAll}
            m={m}
            disableSelectAll
          />
          <tbody>
            <tr>
              <td className="maintenance-table-cell" colSpan="10" style={{ textAlign: "center", padding: "20px" }}>
                {m.loading}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="empty-state-container" style={{ display: "block" }}>
        <div className="empty-state">
          <p>{listSyncing ? m.loading : m.noDataAdjustSearch}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`maintenance-list-container${listSyncing ? " maintenance-list-container--syncing" : ""}`}
      style={{ display: "block" }}
    >
      <table className="maintenance-table">
        <PaymentTableHead
          selectAllRef={selectAllRef}
          selectAll={selectAll}
          toggleSelectAll={toggleSelectAll}
          m={m}
          disableSelectAll={false}
        />
        <tbody
          key={`pay-tbody-${String(rowKeyCompanyId ?? "na")}-${listEpoch}`}
        >
          {data.map((row, index) => (
            <PaymentMaintenanceRow
              key={`${String(rowKeyCompanyId ?? "na")}-${listEpoch}-${getPaymentMaintenanceRowRenderKey(row, index)}`}
              row={row}
              index={index}
              isSelected={
                isPaymentMaintenanceRowSelectable(row) && selectedSet.has(row.transaction_id)
              }
              onToggleRow={toggleSelect}
              m={m}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
