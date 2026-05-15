import { useEffect, useMemo, useRef } from "react";
import CaptureVirtualRows from "./CaptureVirtualRows.jsx";

const ROW_HEIGHT = 44;

function isRowDeleted(row) {
  return row.is_deleted === 1 || row.is_deleted === "1" || row.is_deleted === true;
}

function CaptureVirtualTableHead({ selectAllRef, selectAll, toggleSelectAll, m, disableSelectAll }) {
  const labels = [
    m.tblNo,
    m.tblDtsCreated,
    m.tblProduct,
    m.tblProcess,
    m.tblCurrency,
    m.tblWlGroup,
    m.tblSubmittedBy,
    m.tblDeletedBy,
  ];

  return (
    <div className="maintenance-virtual-thead" role="rowgroup">
      <div className="maintenance-virtual-head-row capture-virtual-head-row" role="row">
        {labels.map((label, i) => (
          <div
            key={label}
            role="columnheader"
            className={`maintenance-virtual-th${
              i === 2 || i === 3 || i === 5 || i === 7 ? " capture-virtual-th--left" : ""
            }${i === 0 ? " capture-virtual-th--no" : ""}`}
          >
            {label}
          </div>
        ))}
        <div
          role="columnheader"
          className="maintenance-virtual-th capture-virtual-th-checkbox maintenance-select-all-header"
        >
          <span className="maintenance-checkbox-cell-inner">
            <input
              type="checkbox"
              id={disableSelectAll ? undefined : "select_all_capture"}
              ref={disableSelectAll ? undefined : selectAllRef}
              className="maintenance-row-checkbox"
              checked={selectAll}
              onChange={toggleSelectAll}
              title={m.selectAll}
              disabled={disableSelectAll}
            />
          </span>
        </div>
      </div>
    </div>
  );
}

export default function CaptureMaintenanceTable({
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
      const selectable = data.filter((r) => !isRowDeleted(r));
      const checked = selectable.filter((r) => selectedSet.has(r.capture_id));
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
              <th>{m.tblDtsCreated}</th>
              <th>{m.tblProduct}</th>
              <th>{m.tblProcess}</th>
              <th>{m.tblCurrency}</th>
              <th>{m.tblWlGroup}</th>
              <th>{m.tblSubmittedBy}</th>
              <th>{m.tblDeletedBy}</th>
              <th className="maintenance-select-all-header">
                <span className="maintenance-checkbox-cell-inner">
                  <input type="checkbox" className="maintenance-row-checkbox" disabled />
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="maintenance-table-cell" colSpan="9" style={{ textAlign: "center", padding: "20px" }}>
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
      className={`maintenance-list-container maintenance-virtual-table capture-virtual-table${
        listSyncing ? " maintenance-list-container--syncing" : ""
      }`}
      style={{ display: "block" }}
    >
      <div className="maintenance-virtual-table-inner capture-virtual-table-inner" role="table">
        <CaptureVirtualTableHead
          selectAllRef={selectAllRef}
          selectAll={selectAll}
          toggleSelectAll={toggleSelectAll}
          m={m}
          disableSelectAll={false}
        />
        <CaptureVirtualRows
          rows={data}
          rowHeight={ROW_HEIGHT}
          rowKeyPrefix={rowKeyPrefix}
          selectedSet={selectedSet}
          onToggleRow={toggleSelect}
          alreadyDeletedTitle={m.alreadyDeleted}
        />
      </div>
    </div>
  );
}
