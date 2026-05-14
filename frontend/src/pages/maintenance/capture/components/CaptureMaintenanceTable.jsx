export default function CaptureMaintenanceTable({
  data,
  loading,
  listSyncing = false,
  selectedIds,
  toggleSelect,
  toggleSelectAll,
  isAllSelected,
  isIndeterminate,
  m,
}) {
  if (loading) {
    return (
      <div className="maintenance-list-container" style={{ display: "block" }}>
        <table className="maintenance-table">
          <thead>
            <tr>
              <th>{m.tblNo}</th><th>{m.tblDtsCreated}</th><th>{m.tblProduct}</th><th>{m.tblProcess}</th><th>{m.tblCurrency}</th><th>{m.tblWlGroup}</th><th>{m.tblSubmittedBy}</th><th>{m.tblDeletedBy}</th>
              <th className="maintenance-select-all-header">
                <span className="maintenance-checkbox-cell-inner"><input type="checkbox" className="maintenance-row-checkbox" disabled /></span>
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
      className={`maintenance-list-container${listSyncing ? " maintenance-list-container--syncing" : ""}`}
      style={{ display: "block" }}
    >
      <table className="maintenance-table">
        <thead>
          <tr>
            <th>{m.tblNo}</th><th>{m.tblDtsCreated}</th><th>{m.tblProduct}</th><th>{m.tblProcess}</th><th>{m.tblCurrency}</th><th>{m.tblWlGroup}</th><th>{m.tblSubmittedBy}</th><th>{m.tblDeletedBy}</th>
            <th className="maintenance-select-all-header">
              <span className="maintenance-checkbox-cell-inner">
                <input
                  type="checkbox"
                  id="select_all_capture"
                  className="maintenance-row-checkbox"
                  title={m.selectAll}
                  checked={isAllSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = isIndeterminate;
                  }}
                  onChange={toggleSelectAll}
                />
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, index) => {
            const isDeleted = row.is_deleted === 1 || row.is_deleted === '1' || row.is_deleted === true;
            const deletedBy = row.deleted_by ? row.deleted_by : '';
            const dtsDeleted = row.dts_deleted ? row.dts_deleted : '';
            const deletedDisplay = isDeleted && deletedBy
              ? `${deletedBy} (${dtsDeleted || '-'})`
              : (isDeleted ? (dtsDeleted || '-') : '-');

            return (
              <tr 
                key={row.capture_id || index} 
                className={`maintenance-row ${isDeleted ? "maintenance-row-deleted" : ""}`}
              >
                <td className="maintenance-table-cell">{row.no || index + 1}</td>
                <td className="maintenance-table-cell">{row.dts_created || '-'}</td>
                <td className="maintenance-table-cell">{row.product || '-'}</td>
                <td className="maintenance-table-cell">{row.process || '-'}</td>
                <td className="maintenance-table-cell maintenance-cell-currency">{row.currency || '-'}</td>
                <td className="maintenance-table-cell">{row.wl_group || '-'}</td>
                <td className="maintenance-table-cell">{row.submitted_by || '-'}</td>
                <td className="maintenance-table-cell">{deletedDisplay}</td>
                <td className="maintenance-table-cell maintenance-cell-checkbox">
                  <span className="maintenance-checkbox-cell-inner">
                    <input
                      type="checkbox"
                      className="maintenance-row-checkbox"
                      checked={selectedIds.includes(row.capture_id)}
                      onChange={() => toggleSelect(row.capture_id)}
                      disabled={isDeleted}
                      title={isDeleted ? m.alreadyDeleted : ""}
                    />
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
