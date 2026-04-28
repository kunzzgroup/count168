import { escapeHtml } from "../captureMaintenanceLogic.js";

export default function CaptureMaintenanceTable({ 
  data, 
  loading, 
  selectedIds, 
  toggleSelect, 
  toggleSelectAll, 
  isAllSelected,
  isIndeterminate 
}) {
  if (loading) {
    return (
      <div className="maintenance-list-container" style={{ display: "block" }}>
        <table className="maintenance-table">
          <thead>
            <tr>
              <th>No.</th><th>Dts Created</th><th>Product</th><th>Process</th><th>Currency</th><th>W/L Group</th><th>Submitted By</th><th>Deleted By</th>
              <th className="maintenance-select-all-header">
                <input type="checkbox" className="maintenance-checkbox" disabled />
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="maintenance-table-cell" colSpan="9" style={{ textAlign: "center", padding: "20px" }}>
                Loading...
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
          <p>No data found. Please adjust your search criteria and try again.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="maintenance-list-container" style={{ display: "block" }}>
      <table className="maintenance-table">
        <thead>
          <tr>
            <th>No.</th><th>Dts Created</th><th>Product</th><th>Process</th><th>Currency</th><th>W/L Group</th><th>Submitted By</th><th>Deleted By</th>
            <th className="maintenance-select-all-header">
              <input 
                type="checkbox" 
                className="maintenance-checkbox" 
                title="Select All" 
                checked={isAllSelected}
                ref={el => {
                  if (el) el.indeterminate = isIndeterminate;
                }}
                onChange={toggleSelectAll}
              />
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
                  {!isDeleted && (
                    <input 
                      type="checkbox" 
                      className="maintenance-row-checkbox" 
                      checked={selectedIds.includes(row.capture_id)}
                      onChange={() => toggleSelect(row.capture_id)}
                    />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
