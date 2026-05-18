import { useEffect, useMemo, useRef } from "react";
import { isPaymentMaintenanceRowSelectable } from "../paymentMaintenanceLogic.js";
import PaymentVirtualRows from "./PaymentVirtualRows.jsx";

const ROW_HEIGHT = 56;

function PaymentVirtualTableHead({ selectAllRef, selectAll, toggleSelectAll, m, disableSelectAll }) {
  const labels = [
    m.tblNo,
    m.tblCreatedAt,
    m.tblAccountTo,
    m.tblAccountFrom,
    m.tblAmount,
    m.tblDescription,
    m.tblRemark,
    m.tblSubmitter,
    m.tblDeleter,
  ];

  return (
    <div className="maintenance-virtual-thead" role="rowgroup">
      <div className="maintenance-virtual-head-row payment-virtual-head-row" role="row">
        {labels.map((label, i) => (
          <div
            key={label}
            role="columnheader"
            className={`maintenance-virtual-th${i === 4 ? " maintenance-header-amount" : ""}`}
          >
            {label}
          </div>
        ))}
        <div
          role="columnheader"
          className="maintenance-virtual-th payment-virtual-th-checkbox maintenance-select-all-header"
        >
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
        </div>
      </div>
    </div>
  );
}

export default function PaymentMaintenanceTable({
  data,
  listEpoch = 0,
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
  const rowKeyPrefix = `${String(rowKeyCompanyId ?? "na")}-${listEpoch}`;

  useEffect(() => {
    if (selectAllRef.current) {
      const selectable = data.filter(
        (r) =>
          isPaymentMaintenanceRowSelectable(r) &&
          !(r.is_deleted === 1 || r.is_deleted === "1" || r.is_deleted === true),
      );
      const checked = selectable.filter((r) => selectedSet.has(r.transaction_id));
      selectAllRef.current.indeterminate = checked.length > 0 && checked.length < selectable.length;
    }
  }, [selectedSet, data]);

  if (loading && (!data || data.length === 0)) {
    return (
      <div className="maintenance-list-container" style={{ display: "block" }}>
        <table className="maintenance-table">
          <thead>
            <tr>
              <th>{m.tblNo}</th>
              <th>{m.tblCreatedAt}</th>
              <th>{m.tblAccountTo}</th>
              <th>{m.tblAccountFrom}</th>
              <th className="maintenance-header-amount">{m.tblAmount}</th>
              <th>{m.tblDescription}</th>
              <th>{m.tblRemark}</th>
              <th>{m.tblSubmitter}</th>
              <th>{m.tblDeleter}</th>
              <th className="maintenance-select-all-header maintenance-cell-checkbox">
                <input type="checkbox" className="maintenance-row-checkbox" disabled />
              </th>
            </tr>
          </thead>
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
      className={`maintenance-list-container maintenance-virtual-table payment-virtual-table${
        listSyncing ? " maintenance-list-container--syncing" : ""
      }`}
      style={{ display: "block" }}
    >
      <div className="maintenance-virtual-table-inner payment-virtual-table-inner" role="table">
        <PaymentVirtualTableHead
          selectAllRef={selectAllRef}
          selectAll={selectAll}
          toggleSelectAll={toggleSelectAll}
          m={m}
          disableSelectAll={false}
        />
        <PaymentVirtualRows
          rows={data}
          rowHeight={ROW_HEIGHT}
          rowKeyPrefix={rowKeyPrefix}
          selectedSet={selectedSet}
          onToggleRow={toggleSelect}
        />
      </div>
    </div>
  );
}

